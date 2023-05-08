const {
    GObject,
    GLib,
    Gio,
    Soup
} = imports.gi;

Gio._promisify(Soup.Session.prototype, "send_async");
Gio._promisify(Gio.File.prototype, "create_async");
Gio._promisify(Gio.OutputStream.prototype, "splice_async");

var CachedImageLoader = GObject.registerClass({}, class CachedImageLoader extends GObject.Object {
    constructor() {
        super();

        this._session = new Soup.Session();
        this._cache_dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'overlay-for-discord@adrian.freund.io']);
        const directory = Gio.File.new_for_path(this._cache_dir)

        if (!directory.query_exists(null)) {
            directory.make_directory_with_parents(null);
        }
    }

    async loadImage(url) {
        log(`Loader called: ${url}`)
        const checksum = new GLib.Checksum(GLib.ChecksumType.SHA256);
        checksum.update(url);

        const file_path = GLib.build_filenamev([this._cache_dir, checksum.get_string()]);
        const file = Gio.File.new_for_path(file_path);

        const exists = file.query_exists(null);
        if (!exists) {
            await this._download(url, file);
        }
    }

    async _download(url, file) {
        const fileStream = await file.create_async(Gio.FileCreateFlags.NONE, null, null);

        let message = new Soup.Message({
            method: "GET",
            uri: GLib.Uri.parse(url, GLib.UriFlags.NONE)
        });

        const stream = await this._session.send_async(message, null, null);
        log(stream);
        await fileStream.splice_async(stream, Gio.OutputStreamSpliceFlags.CLOSE_TARGET, GLib.PRIORITY_DEFAULT, null);
    }
});