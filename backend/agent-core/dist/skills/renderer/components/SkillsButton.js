"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const outline_1 = require("@heroicons/react/24/outline");
const SkillsPopover_1 = __importDefault(require("./SkillsPopover"));
const SkillsButton = ({ onSelectSkill, onManageSkills, className = '', }) => {
    const [isPopoverOpen, setIsPopoverOpen] = (0, react_1.useState)(false);
    const buttonRef = (0, react_1.useRef)(null);
    const handleButtonClick = () => {
        setIsPopoverOpen(prev => !prev);
    };
    const handleClosePopover = () => {
        setIsPopoverOpen(false);
    };
    return (<div className="relative">
      <button ref={buttonRef} type="button" onClick={handleButtonClick} className={`p-2 rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkTextSecondary text-claude-textSecondary hover:text-claude-accent dark:hover:text-claude-accent hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors ${className}`} title="Skills">
        <outline_1.PuzzlePieceIcon className="h-5 w-5"/>
      </button>
      <SkillsPopover_1.default isOpen={isPopoverOpen} onClose={handleClosePopover} onSelectSkill={onSelectSkill} onManageSkills={onManageSkills} anchorRef={buttonRef}/>
    </div>);
};
exports.default = SkillsButton;
//# sourceMappingURL=SkillsButton.js.map