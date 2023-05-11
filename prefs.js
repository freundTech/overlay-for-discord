'use strict';

const {Adw, Gio, Gdk, Gtk, GObject} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {ShortcutRow} = Me.imports.ui.shortcut;


const OverlayPosition = GObject.registerClass({
    GTypeName: "OverlayPosition",
    Properties: {
        'label': GObject.ParamSpec.string(
            'label', 'Label', 'Display name of the position',
            GObject.ParamFlags.READWRITE,
            null),
        'value': GObject.ParamSpec.int(
            'value', 'Value', 'Value to store if the position is selected',
            GObject.ParamFlags.READWRITE,
            null),
    },
}, class extends GObject.Object {
    constructor(label, value) {
        super({label, value});
    }
});


const OverlayPositionModel = GObject.registerClass({
        GTypeName: "OverlayPositionModel",
        Implements: [Gio.ListModel]
    }, class extends GObject.Object {
        constructor(props) {
            super(props);

            this._items = [
                new OverlayPosition('Top', 'top'),
                new OverlayPosition('Bottom', 'bottom'),
                new OverlayPosition('Left', 'left'),
                new OverlayPosition('Right', 'right'),
            ];
        }

        vfunc_get_item(position) {
            return this._items[position];
        }

        vfunc_get_n_items() {
            return this._items.length;
        }

        vfunc_get_item_type() {
            return OverlayPositions.$gtype;
        }
    }
)


const PrefsWidget = GObject.registerClass({
        GTypeName: "OverlayPrefsWidget",
        Template: Me.dir.get_child('prefs.ui').get_uri(),
        InternalChildren: [
            'position_row',
            'show_username_switch',
            'show_picture_switch',
            'overlay_size_slider',
            'mute_row',
            'deafen_row',
            'hide_row',
        ]
    }, class extends Adw.PreferencesPage {
        constructor(params = {}) {
            super(params);

            this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.overlay-for-discord');


            const model = new OverlayPositionModel()
            this._position_row.set_property("model", model);
            this._position_row.set_property("expression", new Gtk.PropertyExpression(OverlayPosition, null, "label"));

            this._overlay_size_slider.adjustment = Gtk.Adjustment.new(40, 30, 70, 1, 0, 0);

            this._position_row.selected = this._settings.get_enum("position")
            this._settings.connect('changed::position', settings => {
                this._position_row.selected = settings.get_enum("position")
            })
            this._position_row.connect('notify::selected-item', (widget, _property) => {
                this._settings.set_enum('position', widget.selected);
            })

            this._overlay_size_slider.adjustment.value = this._settings.get_int('size');
            this._overlay_size_slider.adjustment.connect('notify::value', (widget, _property) => {
                this._settings.set_int('size', widget.value);
            });

            this._settings.bind('show-username', this._show_username_switch, 'active', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('show-profile-picture', this._show_picture_switch, 'active', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('mute-key', this._mute_row, 'values', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('deafen-key', this._deafen_row, 'values', Gio.SettingsBindFlags.DEFAULT);
            this._settings.bind('hide-key', this._hide_row, 'values', Gio.SettingsBindFlags.DEFAULT);

            // Make sure at least one of show username and show picture are active
            this._show_username_switch.connect("notify::active", (widget, _property) => {
                if (!widget.active && !this._show_picture_switch.active) {
                    this._settings.set_boolean('show-profile-picture', true);
                }
            })
            this._show_picture_switch.connect("notify::active", (widget, _property) => {
                if (!widget.active && !this._show_username_switch.active) {
                    this._settings.set_boolean('show-username', true);
                }
            })
        }
    }
);

function init() {
}

function buildPrefsWidget() {
    return new PrefsWidget();
}