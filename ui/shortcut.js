const {Adw, Gdk, Gtk, GLib, GObject} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

GObject.TYPE_STRV = GObject.type_from_name("GStrv")

var ShortcutRow = GObject.registerClass({
        GTypeName: "OverlayShortcutRow",
        Template: Me.dir.get_child("ui").get_child("prefs-shortcut-row.ui").get_uri(),
        Properties: {
            'values': GObject.ParamSpec.boxed("values", "Values", "The currently set shortcuts", GObject.ParamFlags.READWRITE, GLib.strv_get_type()),
        },
        InternalChildren: [
            'button',
        ]
    }, class extends Adw.ActionRow {
        constructor(params = {}) {
            super(params);
            this.values = [];

            this.bind_property_full('values', this._button, 'label', GObject.BindingFlags.SYNC_CREATE, (binding, values) => {
                let labels = values.map(value => {
                    const [success, keyval, state] = Gtk.accelerator_parse(value);

                    if (!success) {
                        return "Invalid";
                    }
                    return Gtk.accelerator_get_label(keyval, state);
                });
                return [true, labels.join(", ")]
            }, null)
        }

        on_button_clicked(_button) {
            const dialog = new ShortcutDialog({
                "transient-for": this.get_root()
            });
            dialog.choose_shortcut().then(result => {
                const [keyval, state] = result;

                this.values = [Gtk.accelerator_name(keyval, state)];
            }).catch(error => {
                // ignore. User canceled operation.
            })
        }
    }
)

const ShortcutDialog = GObject.registerClass({
        GTypeName: "OverlayShortcutDialog",
        Template: Me.dir.get_child("ui").get_child("prefs-shortcut-dialog.ui").get_uri(),
        InternalChildren: [
            'event_controller'
        ]
    }, class extends Adw.Window {
        constructor(params = {}) {
            super(params);
        }

        on_key_pressed(_widget, keyval, keycode, state) {
            if (keyval === Gdk.KEY_Escape) {
                this.cancel();
                return;
            }

            let event = this._event_controller.get_current_event()

            state &= Gtk.accelerator_get_default_mod_mask();

            if (!event.is_modifier()) {
                this.result([keyval, state]);
            }
        }

        result(result) {
            this._resolve(result);
            this.close();
        }

        cancel() {
            this._reject();
            this.close();
        }

        choose_shortcut() {
            return new Promise((resolve, reject) => {
                this._resolve = resolve;
                this._reject = reject;
                this.present()
            })
        }
    }
);
