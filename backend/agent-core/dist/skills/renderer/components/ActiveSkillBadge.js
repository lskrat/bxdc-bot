"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_redux_1 = require("react-redux");
const outline_1 = require("@heroicons/react/24/outline");
const skillSlice_1 = require("../skillSlice");
const i18n_1 = require("../i18n");
const ActiveSkillBadge = () => {
    const dispatch = (0, react_redux_1.useDispatch)();
    const activeSkillIds = (0, react_redux_1.useSelector)((state) => state.skill.activeSkillIds);
    const skills = (0, react_redux_1.useSelector)((state) => state.skill.skills);
    const activeSkills = activeSkillIds
        .map(id => skills.find(s => s.id === id))
        .filter((s) => s !== undefined);
    if (activeSkills.length === 0)
        return null;
    const handleRemoveSkill = (e, skillId) => {
        e.stopPropagation();
        dispatch((0, skillSlice_1.toggleActiveSkill)(skillId));
    };
    const handleClearAll = (e) => {
        e.stopPropagation();
        dispatch((0, skillSlice_1.clearActiveSkills)());
    };
    return (<div className="flex items-center gap-1.5 flex-wrap">
      {activeSkills.map(skill => (<div key={skill.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-claude-accent/10 border border-claude-accent/20">
          <outline_1.PuzzlePieceIcon className="h-3 w-3 text-claude-accent"/>
          <span className="text-xs font-medium text-claude-accent max-w-[80px] truncate">
            {skill.name}
          </span>
          <button type="button" onClick={(e) => handleRemoveSkill(e, skill.id)} className="p-0.5 rounded hover:bg-claude-accent/20 transition-colors" title={i18n_1.skillI18n.t('clearSkill')}>
            <outline_1.XMarkIcon className="h-2.5 w-2.5 text-claude-accent"/>
          </button>
        </div>))}
      {activeSkills.length > 1 && (<button type="button" onClick={handleClearAll} className="text-xs text-claude-accent/70 hover:text-claude-accent transition-colors" title={i18n_1.skillI18n.t('clearAllSkills')}>
          {i18n_1.skillI18n.t('clearAll')}
        </button>)}
    </div>);
};
exports.default = ActiveSkillBadge;
//# sourceMappingURL=ActiveSkillBadge.js.map