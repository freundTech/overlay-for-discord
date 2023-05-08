const {
    GObject,
    GLib,
    Gio,
    Soup
} = imports.gi;

const ByteArray = imports.byteArray;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Command, Event, ErrorCode } = Me.imports.commands
const { UserModel } = Me.imports.overlay

Gio._promisify(Soup.Session.prototype, "websocket_connect_async");

const RECONNECTION_TIMEOUT = 100;
const MESSAGE_TIMEOUT = 1000;
const STREAMKIT_URL = "https://streamkit.discord.com";
const MIN_PORT = 6463;
const MAX_PORT = 6472;

const get_discord_url = function (port, client_id) {
    return `ws://127.0.0.1:${port}/?v=1&client_id=${client_id}`;
}

const DiscordUserListModel = GObject.registerClass({
        GTypeName: "DiscordUserListModel",
        Implements: [Gio.ListModel]
    }, class extends GObject.Object {
        constructor(props) {
            super(props);

            this._items = [];
            this._id_map = {};
        }

        addUser(user, id) {
            this._items.push(id);
            this._id_map[id] = user;
            this.items_changed(this._items.length-1, 0, 1)
        }

        clear() {
            const oldLength = this._items.length;
            this._items = [];
            this._id_map = {};
            this.items_changed(0, oldLength, 0);
        }

        vfunc_get_item(position) {
            return this._id_map[this._items[position]];
        }

        vfunc_get_n_items() {
            return this._items.length;
        }

        vfunc_get_item_type() {
            return OverlayPositions.$gtype;
        }

        getById(id) {
            return this._id_map[id];
        }

        removeById(id) {
            const index = this._items.indexOf(id);
            delete this._id_map[id];
            this.items_changed(index, 1, 0);
        }

        replaceById(id, user) {
            const index = this._items.indexOf(id);
            this._id_map[id] = user
            this.item_changed(index, 1, 1);
        }
    }
)

var DiscordConnector = GObject.registerClass({
    Properties: {
        "users": GObject.ParamSpec.object("users", "Users", "The users currently in the channel", GObject.ParamFlags.READWRITE, Gio.ListModel.$gtype)
    }
}, class DiscordConnector extends GObject.Object {
    constructor(settings) {
        super();
        this.settings = settings;

        this.session = null;
        this.connection = null;
        this.access_token = settings.get_value("access-token").deepUnpack();
        this.client_id = "207646673902501888"
        this.port = MIN_PORT;
        this.authenticationErrorCount = 0;

        this.pending_requests = {};
        this.should_connect = false;

        this.users = new DiscordUserListModel();

        this.muted = false;
        this.deaf = false;
        this.current_channel = null;

        this.decoder = new TextDecoder();
    }

    _generateNonce() {
        return GLib.uuid_string_random();
    }

    async connect() {
        this.should_connect = true;
        if (this.connection !== null) {
            return
        }

        if (this.session === null) {
            this.session = new Soup.Session();
        }
        let message = new Soup.Message({
            method: "GET",
            uri: GLib.Uri.parse(get_discord_url(this.port, this.client_id), GLib.UriFlags.NONE)
        });

        try {
            this.connection = await this.session.websocket_connect_async(message, STREAMKIT_URL, [], null, null)
        } catch (err) {
            this.port += 1;
            if (this.port > MAX_PORT) {
                this.port = MIN_PORT;
            }

            setTimeout(this.connect.bind(this), RECONNECTION_TIMEOUT);
            return;
        }

        this.connection.connect('closed', this.onClosed.bind(this));
        this.connection.connect('error', this.onError.bind(this));
        this.connection.connect('message', this.onMessage.bind(this));

        log('Connected to discord');
    }

    disconnect() {
        this.should_connect = false;
        if (this.connection !== null) {
            this.connection.close(1001, null);
        }
    }

    _sendCommand(cmd) {
        return new Promise( (resolve, reject) => {
            if (this.connection === null) {
                reject("Not connected");
                return;
            }

            let message = JSON.stringify(cmd);
            //log(`Send message: ${message}`);
            this.connection.send_text(message);
            this.pending_requests[cmd.nonce] = resolve

            setTimeout(() => {
                reject("Timeout exceeded");
                delete this.pending_requests[cmd.nonce];
            }, MESSAGE_TIMEOUT);
        });
    }

    onClosed() {
        log('Connection closed');
        this.connection = null;
        this.users.clear();
        if (this.should_connect) {
            setTimeout(this.connect.bind(this), RECONNECTION_TIMEOUT);
        }
    }

    onError(connection, err) {
        log("Connection error:")
        log(err)
    }

    onMessage(connection, type, data) {
         if (type !== Soup.WebsocketDataType.TEXT)
            return;

        const str = this.decoder.decode(data.toArray());
        const message = JSON.parse(str)

        //log(`Recv message: ${str}`);

        // If this is a reponse to a request we sent handle it here
        if (message.nonce in this.pending_requests) {
            this.pending_requests[message.nonce](message);
            return;
        }

        let promise = null;
        switch (message.cmd) {
            case Command.DISPATCH:
                promise = this.onEventDispatch(message.evt, message.data)
                break;
            default:
                promise = Promise.reject(`Unhandled command: ${message.cmd}`)
        }

        promise.catch(log);
    }

    async onEventDispatch(evt, data) {
        switch (evt) {
            case Event.READY:
                await this.authenticate();
                break;
            case Event.VOICE_CHANNEL_SELECT:
                await this._onChannelChanged(data);
                break;
            case Event.VOICE_STATE_CREATE:
                await this._onUserJoin(data)
                break;
            case Event.VOICE_STATE_DELETE:
                await this._onUserLeave(data)
                break;
            case Event.VOICE_STATE_CHANGE:
                await this._onUserChange(data)
                break;
            case Event.VOICE_SETTINGS_UPDATE:
                await this._onVoiceSettingsUpdate(data);
                break;
            case Event.SPEAKING_START:
                await this._onSpeakingStart(data)
                break;
            case Event.SPEAKING_STOP:
                await this._onSpeakingStop(data);
                break;
            default:
                log(`Unhandled dispatch: ${evt}`)
        }
    }

    async authenticate() {
        if (this.access_token === null) {
            await this.getAccessToken();
        }

        let cmd = {
            cmd: Command.AUTHENTICATE,
            args: {
                "access_token": this.access_token,
            },
            "nonce": this._generateNonce(),
        }

        const response = await this._sendCommand(cmd);
        if (response.evt === Event.ERROR) {
            switch (response.data.code) {
                case ErrorCode.WRONG_USER:
                    // This might happen while discord is still starting and not yet logged in
                   break;
                default:
                    log(`Error ${response.data.error} while trying to authenticate`);
            }
            this.authenticationErrorCount += 1;

            if (this.authenticationErrorCount >= 3) {
                this.access_token = null;
            }
            setTimeout(this.authenticate.bind(this), 1000);
            return;
        }



        await Promise.all([
                this._subscribeEvent(Event.VOICE_CHANNEL_SELECT),
                this._subscribeEvent(Event.VOICE_SETTINGS_UPDATE),
                this._onChannelJoined(await this.getSelectedVoiceChannel()),
                this._onVoiceSettingsUpdate(await this.getVoiceSettings()),
        ]);
    }

    async getAccessToken() {
        let cmd = {
            cmd: Command.AUTHORIZE,
            args: {
                "client_id": this.client_id,
                "scopes": ["rpc"],
                "prompt": "none",
            },
            nonce: this._generateNonce(),
        }

        const response = await this._sendCommand(cmd);

        let message = new Soup.Message({
            method: "POST",
            uri: GLib.Uri.parse(STREAMKIT_URL + "/overlay/token", GLib.UriFlags.NONE)
        });
        let body = JSON.stringify({code: response.data.code})
        message.set_request_body_from_bytes("application/json", new GLib.Bytes(body));

        const bytes = await this.session.send_and_read_async(message, null, null);
        let response2 = JSON.parse(ByteArray.toString(bytes.get_data()));

        this.access_token = response2.access_token;
        this.settings.set_value("access-token", new GLib.Variant("ms", this.access_token));
    }

    async getChannel(channel_id) {
        const cmd = {
            cmd: Command.GET_CHANNEL,
            args: {channel_id: channel_id},
            nonce: this._generateNonce(),
        };

        const response = await this._sendCommand(cmd);

        return response.data;
    }

    async _subscribeEvent(event, args = {}) {
        const cmd = {
            cmd: Command.SUBSCRIBE,
            args: args,
            evt: event,
            nonce: this._generateNonce(),
        };

        await this._sendCommand(cmd);
    }

    async _unsubscribeEvent(event, args = {}) {
        const cmd = {
            cmd: Command.UNSUBSCRIBE,
            args: args,
            evt: event,
            nonce: this._generateNonce(),
        };

        await this._sendCommand(cmd);
    }

    async getSelectedVoiceChannel() {
        const cmd = {
            cmd: Command.GET_SELECTED_VOICE_CHANNEL,
            args: {},
            nonce: this._generateNonce(),
        }

        const response = await this._sendCommand(cmd);
        return response.data;
    }


    async getVoiceSettings() {
        const cmd = {
            cmd: Command.GET_VOICE_SETTINGS,
            args: {},
            nonce: this._generateNonce(),
        }

        const response = await this._sendCommand(cmd)
        return response.data;
    }

    async _onVoiceSettingsUpdate(voiceSettings) {
        this.muted = voiceSettings.mute;
        this.deaf = voiceSettings.deaf;
    }

    async toggleMute() {
        let cmd = {
            cmd: Command.SET_VOICE_SETTINGS,
            args: {mute: !this.muted},
            nonce: this._generateNonce(),
        }

        try {
            const response = await this._sendCommand(cmd);
            this.muted = response.data.mute;
        }
        catch (err) {
            // ignore
        }
    }

    async toggleDeafen() {
        let cmd = {
            cmd: Command.SET_VOICE_SETTINGS,
            args: {deaf: !this.deaf},
            nonce: this._generateNonce(),
        }

        try {
            const response = await this._sendCommand(cmd);
            this.deaf = response.data.deaf
        }
        catch (err) {
            // ignore
        }
    }

    async _onChannelChanged(data) {
        await this._onChannelLeft(data)
        if (data.channel_id === null) {
            this.current_channel = null;
            return;
        }

        const response = await this.getChannel(data.channel_id, data.guild_id);
        await this._onChannelJoined(response);
    }

    async _onChannelLeft(data) {
        this.users.clear();

        if (this.current_channel !== null) {
            await Promise.all([
                this._unsubscribeEvent(Event.VOICE_STATE_CREATE, {channel_id: this.current_channel}),
                this._unsubscribeEvent(Event.VOICE_STATE_DELETE, {channel_id: this.current_channel}),
                this._unsubscribeEvent(Event.VOICE_STATE_CHANGE, {channel_id: this.current_channel}),
                this._unsubscribeEvent(Event.SPEAKING_START, {channel_id: this.current_channel}),
                this._unsubscribeEvent(Event.SPEAKING_STOP, {channel_id: this.current_channel}),
            ])
        }

    }

    async _onChannelJoined(channel) {
        if (channel == null) {
            this.current_channel = null;
            return;
        }
        this.current_channel = channel.id;

        channel.voice_states.forEach(state => {
            this.users.addUser(this._createUserModel(state), state.user.id);
        })

        await Promise.all([
            this._subscribeEvent(Event.VOICE_STATE_CREATE, {channel_id: channel.id}),
            this._subscribeEvent(Event.VOICE_STATE_DELETE, {channel_id: channel.id}),
            this._subscribeEvent(Event.VOICE_STATE_CHANGE, {channel_id: channel.id}),
            this._subscribeEvent(Event.SPEAKING_START, {channel_id: channel.id}),
            this._subscribeEvent(Event.SPEAKING_STOP, {channel_id: channel.id}),
        ])
    }

    async _onUserJoin(data) {
        this.users.addUser(this._createUserModel(data), data.user.id);
    }

    async _onUserLeave(data) {
        this.users.removeById(data.user.id);
    }

    async _onUserChange(data) {
        this.users.replaceById(data.user.id, this._createUserModel(data));
    }

    async _onSpeakingStart(data) {
        if (data.channel_id !== this.current_channel) {
            log(`Got notification for channel ${data.channel_id}, but we are in channel ${this.current_channel}. Ignoring`);
            return;
        }

        this.users.getById(data.user_id).speaking = true;
    }

    async _onSpeakingStop(data) {
        if (data.channel_id !== this.current_channel) {
            log(`Got notification for channel ${data.channel_id}, but we are in channel ${this.current_channel}. Ignoring`);
            return;
        }

        this.users.getById(data.user_id).speaking = false;
    }

    _createUserModel(data) {
        return new UserModel({
            username: data.nick,
            profilePicture: `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.jpg`,
        });
    }
});
