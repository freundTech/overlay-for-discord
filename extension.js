// This is a handy import we'll use to grab our extension's object
const {
    Clutter,
    Gio,
    GLib,
    GObject,
    Meta,
    Shell,
    St,
} = imports.gi;

const {
    main: Main,
} = imports.ui;

const MainLoop = imports.mainloop

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {DiscordConnector} = Me.imports.discord

const {Overlay} = Me.imports.overlay


class Extension {

    constructor() {
    }

    /**
     * This function is called when your extension is enabled, which could be
     * done in GNOME Extensions, when you log in or when the screen is unlocked.
     *
     * This is when you should setup any UI for your extension, change existing
     * widgets, connect signals or modify GNOME Shell's behaviour.
     */
    enable() {
        log(`enabling ${Me.metadata.name}`);
        //Main.layoutManager.uiGroup.add_child(this.myIcon);

        this.settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.overlay-for-discord');

        this._connector = new DiscordConnector(this.settings);

        this._overlay = new Overlay(this.settings, this._connector);
        Main.layoutManager.addTopChrome(this._overlay);

        this._connector.bind_property('users', this._overlay, 'users', GObject.BindingFlags.SYNC_CREATE);


        this._connector.connect();

        Main.wm.addKeybinding("mute-key", this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this.onMuteKey.bind(this))

        Main.wm.addKeybinding("deafen-key", this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this.onDeafenKey.bind(this))

        Main.wm.addKeybinding("hide-key", this.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this.onHideKey.bind(this))
    }


    /**
     * This function is called when your extension is uninstalled, disabled in
     * GNOME Extensions, when you log out or when the screen locks.
     *
     * Anything you created, modified or setup in enable() MUST be undone here.
     * Not doing so is the most common reason extensions are rejected in review!
     */
    disable() {
        log(`disabling ${Me.metadata.name}`);
        this._connector.disconnect();

        Main.wm.removeKeybinding("mute-key");
        Main.wm.removeKeybinding("deafen-key");

        Main.layoutManager.removeChrome(this._overlay);
        this._overlay.destroy();

        this._connector = null;
        this._overlay = null;
    }

    onMuteKey() {
        this._connector.toggleMute();
    }

    onDeafenKey() {
        this._connector.toggleDeafen();
    }

    onHideKey() {
        this._overlay.toggle();
    }
}


/**
 * This function is called once when your extension is loaded, not enabled. This
 * is a good time to setup translations or anything else you only do once.
 *
 * You MUST NOT make any changes to GNOME Shell, connect any signals or add any
 * MainLoop sources here.
 *
 * @param {ExtensionMeta} meta - An extension meta object, described below.
 * @returns {Object} an object with enable() and disable() methods
 */
function init(meta) {
    log(`initializing ${meta.metadata.name}`);

    return new Extension();
}
