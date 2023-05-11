FROM quay.io/fedora/fedora:38

RUN dnf install -y npm glib2 gnome-shell && dnf clean all
RUN npm install -g sass

ENTRYPOINT [ "sass" ]