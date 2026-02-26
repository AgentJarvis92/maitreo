/**
 * Simple logging utility
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
class Logger {
    level;
    constructor() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
        this.level = LogLevel[envLevel] || LogLevel.INFO;
    }
    log(level, message, ...args) {
        if (level < this.level)
            return;
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        const prefix = `[${timestamp}] [${levelName}]`;
        switch (level) {
            case LogLevel.ERROR:
                console.error(prefix, message, ...args);
                break;
            case LogLevel.WARN:
                console.warn(prefix, message, ...args);
                break;
            default:
                console.log(prefix, message, ...args);
        }
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, message, ...args);
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, message, ...args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, message, ...args);
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, message, ...args);
    }
}
export const logger = new Logger();
export default logger;
//# sourceMappingURL=logger.js.map