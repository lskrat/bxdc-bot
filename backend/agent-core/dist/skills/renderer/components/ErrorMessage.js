"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const ErrorMessage = ({ message, className = '' }) => {
    if (!message)
        return null;
    return (<div className={`rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300 ${className}`.trim()} role="alert">
      {message}
    </div>);
};
exports.default = ErrorMessage;
//# sourceMappingURL=ErrorMessage.js.map