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
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_redux_1 = require("react-redux");
const outline_1 = require("@heroicons/react/24/outline");
const i18n_1 = require("../i18n");
const service_1 = require("../service");
const SkillsPopover = ({ isOpen, onClose, onSelectSkill, onManageSkills, anchorRef, }) => {
    const [searchQuery, setSearchQuery] = (0, react_1.useState)('');
    const [maxListHeight, setMaxListHeight] = (0, react_1.useState)(256);
    const popoverRef = (0, react_1.useRef)(null);
    const searchInputRef = (0, react_1.useRef)(null);
    const skills = (0, react_redux_1.useSelector)((state) => state.skill.skills);
    const activeSkillIds = (0, react_redux_1.useSelector)((state) => state.skill.activeSkillIds);
    const filteredSkills = skills
        .filter(s => s.enabled)
        .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service_1.skillService.getLocalizedSkillDescription(s.id, s.name, s.description).toLowerCase().includes(searchQuery.toLowerCase()));
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            if (anchorRef.current) {
                const anchorRect = anchorRef.current.getBoundingClientRect();
                const availableHeight = anchorRect.top - 120 - 60;
                setMaxListHeight(Math.max(120, Math.min(256, availableHeight)));
            }
            if (searchInputRef.current) {
                setTimeout(() => searchInputRef.current?.focus(), 0);
            }
        }
        if (!isOpen) {
            setSearchQuery('');
        }
    }, [isOpen, anchorRef]);
    (0, react_1.useEffect)(() => {
        if (!isOpen)
            return;
        const handleClickOutside = (event) => {
            const target = event.target;
            const isInsidePopover = popoverRef.current?.contains(target);
            const isInsideAnchor = anchorRef.current?.contains(target);
            if (!isInsidePopover && !isInsideAnchor) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, anchorRef]);
    (0, react_1.useEffect)(() => {
        if (!isOpen)
            return;
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);
    const handleSelectSkill = (skill) => {
        onSelectSkill(skill);
    };
    const handleManageSkills = () => {
        onManageSkills();
        onClose();
    };
    if (!isOpen)
        return null;
    return (<div ref={popoverRef} className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-xl z-50">
      
      <div className="p-3 border-b dark:border-claude-darkBorder border-claude-border">
        <div className="relative">
          <outline_1.MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary"/>
          <input ref={searchInputRef} type="text" placeholder={i18n_1.skillI18n.t('searchSkills')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"/>
        </div>
      </div>

      
      <div className="overflow-y-auto py-1" style={{ maxHeight: `${maxListHeight}px` }}>
        {filteredSkills.length === 0 ? (<div className="px-4 py-6 text-center text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {i18n_1.skillI18n.t('noSkillsAvailable')}
          </div>) : (filteredSkills.map((skill) => {
            const isActive = activeSkillIds.includes(skill.id);
            return (<button key={skill.id} onClick={() => handleSelectSkill(skill)} className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${isActive
                    ? 'dark:bg-claude-accent/10 bg-claude-accent/10'
                    : 'dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'}`}>
                <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive
                    ? 'bg-claude-accent text-white'
                    : 'dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover'}`}>
                  {isActive ? (<outline_1.CheckIcon className="h-4 w-4"/>) : (<outline_1.PuzzlePieceIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary"/>)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${isActive
                    ? 'text-claude-accent'
                    : 'dark:text-claude-darkText text-claude-text'}`}>
                      {skill.name}
                    </span>
                    {skill.isOfficial && (<span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-claude-accent/10 text-claude-accent flex-shrink-0">
                        {i18n_1.skillI18n.t('official')}
                      </span>)}
                  </div>
                  <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary truncate mt-0.5">
                    {service_1.skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description)}
                  </p>
                </div>
              </button>);
        }))}
      </div>

      
      <div className="border-t dark:border-claude-darkBorder border-claude-border">
        <button onClick={handleManageSkills} className="w-full flex items-center justify-between px-4 py-3 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors rounded-b-xl">
          <span>{i18n_1.skillI18n.t('manageSkills')}</span>
          <outline_1.Cog6ToothIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary"/>
        </button>
      </div>
    </div>);
};
exports.default = SkillsPopover;
//# sourceMappingURL=SkillsPopover.js.map