var Command = Object.freeze({
    DISPATCH: "DISPATCH",

    AUTHORIZE: "AUTHORIZE",
    AUTHENTICATE: "AUTHENTICATE",

    GET_CHANNEL: "GET_CHANNEL",
    GET_SELECTED_VOICE_CHANNEL: "GET_SELECTED_VOICE_CHANNEL",
    GET_VOICE_SETTINGS: "GET_VOICE_SETTINGS",
    SET_VOICE_SETTINGS: "SET_VOICE_SETTINGS",
    SUBSCRIBE: "SUBSCRIBE",
    UNSUBSCRIBE: "UNSUBSCRIBE",
})

var Event = Object.freeze({
    READY: "READY",
    ERROR: "ERROR",
    VOICE_CHANNEL_SELECT: "VOICE_CHANNEL_SELECT",
    VOICE_STATE_CREATE: "VOICE_STATE_CREATE",
    VOICE_STATE_DELETE: "VOICE_STATE_DELETE",
    VOICE_STATE_CHANGE: "VOICE_STATE_CHANGE",
    VOICE_SETTINGS_UPDATE: "VOICE_SETTINGS_UPDATE",
    SPEAKING_START: "SPEAKING_START",
    SPEAKING_STOP: "SPEAKING_STOP",
})

var ErrorCode = Object.freeze({
    WRONG_USER: 4009,
})