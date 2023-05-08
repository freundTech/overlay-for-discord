const {
    Clutter,
    GLib,
    Gio,
    GObject,
    St,
} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {
    CachedImageLoader
} = Me.imports.cache;

var UserModel = GObject.registerClass({
    GTypeName: "OverlayUserModel",
    Properties: {
        "username": GObject.ParamSpec.string("username", "Username", "The username of the user", GObject.ParamFlags.READWRITE, null),
        "profile-picture": GObject.ParamSpec.string("profile-picture", "Profile picture", "The profile picture of the user", GObject.ParamFlags.READWRITE, null),
        "speaking": GObject.ParamSpec.boolean("speaking", "Speaking", "If the user is currently speaking", GObject.ParamFlags.READWRITE, false),
        "muted": GObject.ParamSpec.boolean("muted", "Muted", "If the user is currently muted", GObject.ParamFlags.READWRITE, false),
        "deaf": GObject.ParamSpec.boolean("deaf", "Deaf", "If the user is currently deafened", GObject.ParamFlags.READWRITE, false),
    }
}, class extends GObject.Object {
})

const UserPictureWidget = GObject.registerClass({
    GTypeName: "OverlayUserPicture",
    CssName: "OverlayUserPicture",
}, class UserPictureWidget extends St.Widget {
    set_size(width, height) {
        super.set_size(width, height);

        this._update_style();
    }

    set_image(url) {
        this._image = url;

        this._update_style();
    }

    _update_style() {
        this.style = `border-radius: ${this.width / 2 + 1}px ${this.height / 2 + 1}px; background-image: url(${this._image});`
    }

})


const UserWidget = GObject.registerClass({
        GTypeName: "OverlayUserWidget",
        CssName: "OverlayUserWidget",
        Properties: {
            "show-name": GObject.ParamSpec.boolean("show-name", "Show name", "Display the name of the user", GObject.ParamFlags.READWRITE, true),
            "show-icon": GObject.ParamSpec.boolean("show-icon", "Show icon", "Display the profile picture of the user", GObject.ParamFlags.READWRITE, true),
            "overlay-size": GObject.ParamSpec.uint("overlay-size", "Size", "The size of the overlay icons", GObject.ParamFlags.READWRITE, 0, 255, 40),
            "user": GObject.ParamSpec.object("user", "User", "The user to display", GObject.ParamFlags.READWRITE, UserModel),
        }
    }, class UserWidget extends St.Widget {
        constructor(user) {
            super()
            this._user = user;

            this.layout_manager = new Clutter.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL});


            this._icon = new UserPictureWidget({})
            this._label = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
            })
            this.add_child(this._icon);
            this.add_child(this._label);

            this.bind_property('show-icon', this._icon, 'visible', GObject.BindingFlags.SYNC_CREATE);
            this.bind_property('show-name', this._label, 'visible', GObject.BindingFlags.SYNC_CREATE);
            this.connect('notify::overlay-size', (_widget, _value) => {
                this._icon.set_size(this.overlaySize, this.overlaySize);
            })

            this._userBinding = new GObject.BindingGroup()
            this._userBinding.bind('username', this._label, 'text', GObject.BindingFlags.SYNC_CREATE);
            this._userBinding.bind_full('speaking', this, 'style-class', GObject.BindingFlags.SYNC_CREATE, (binding, speaking) => {
                if (speaking) {
                    return [1, "speaking"];
                } else {
                    return [1, ""];
                }
            }, null);
            this._userBinding.source = user;
            this._icon.set_image(user.profilePicture);
            //this.imageLoader.loadImage(user.profilePicture).catch(log);
        }

        set user(user) {
            this._userBinding.source = user;
            this._user = user;
            //this.imageLoader.loadImage(user.profilePicture).catch(log);
        }

        get user() {
            return this._user;
        }
    }
)

var Overlay = GObject.registerClass({
        GTypeName: "OverlayWidgetContainer",
        CssName: "OverlayWidgetContainer",
        Properties: {
            "show-names": GObject.ParamSpec.boolean("show-names", "Show name", "Display the name of the user", GObject.ParamFlags.READWRITE, true),
            "show-icons": GObject.ParamSpec.boolean("show-icons", "Show icon", "Display the profile picture of the user", GObject.ParamFlags.READWRITE, true),
            "overlay-size": GObject.ParamSpec.uint("overlay-size", "Size", "The size of the overlay icons", GObject.ParamFlags.READWRITE, 0, 255, 40),
            "users": GObject.ParamSpec.object("users", "Users", "The users currently in the channel", GObject.ParamFlags.READWRITE, Gio.ListModel.$gtype),
        }
    }, class Overlay extends St.Widget {
        constructor(settings) {
            super({
                name: 'overlay-for-discord',
                reactive: false,
                layout_manager: new Clutter.BinLayout(),
                x_expand: true,
                y_expand: true,
            });

            this._settings = settings;

            this._users = null;

            this._position = this._settings.get_string('position');
            this._vertical = (this._position === 'left' || this._position === 'right');

            this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

            this._container = new St.BoxLayout({
                name: 'OverlayContainer',
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                vertical: true,
                x_expand: false,
                y_expand: true,

            });

            this.add_child(this._container)

            this._settings.connect('changed::position', this._updatePosition.bind(this));
            this._settings.bind('show-username', this, 'show-names', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('show-profile-picture', this, 'show-icons', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('size', this, 'overlay-size', Gio.SettingsBindFlags.DEFAULT);
        }

        vfunc_get_preferred_height(_forWidth) {
            let height = global.stage.height;
            return [height, height];
        }

        set users(users) {
            this._container.remove_all_children();
            if (this._users !== null) {
                this._users.signal_handlers_disconnect_by_func(this.updateUsers.bind(this));
            }

            for (let i = 0; i < users.get_n_items(); i++) {
                this.addUser(this.users.get_item(i), i);
            }
            users.connect('items-changed', this.updateUsers.bind(this));
            this._users = users;
        }

        get users() {
            return this._users;
        }

        updateUsers(model, position, removed, added) {
            for (let i = position; i < position + removed; i++) {
                let child = this._container.get_child_at_index(position);
                this._container.remove_child(child);
            }

            for (let i = position; i < position + added; i++) {
                const user = model.get_item(i);
                this.addUser(user, i);
            }
        }

        addUser(user, i) {
            const widget = new UserWidget(user);
            this.bind_property('show-names', widget, 'show-name', GObject.BindingFlags.SYNC_CREATE);
            this.bind_property('show-icons', widget, 'show-icon', GObject.BindingFlags.SYNC_CREATE);
            this.bind_property('overlay-size', widget, 'overlay-size', GObject.BindingFlags.SYNC_CREATE);
            this._container.insert_child_at_index(widget, i);
        }

        _updatePosition() {
            //todo
        }

        toggle() {
            this.visible = !this.visible;
        }
    }
)