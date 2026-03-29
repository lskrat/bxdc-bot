"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const outline_1 = require("@heroicons/react/24/outline");
const i18n_1 = require("../i18n");
const SkillsManager_1 = __importDefault(require("./SkillsManager"));
const SkillsView = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge }) => (<div className="flex-1 flex flex-col dark:bg-claude-darkBg bg-claude-bg h-full">
      <div className="draggable flex h-12 items-center justify-between px-4 border-b dark:border-claude-darkBorder border-claude-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && (<div className="non-draggable flex items-center gap-1">
              <button type="button" onClick={onToggleSidebar} className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
                <outline_1.Bars3Icon className="h-4 w-4"/>
              </button>
              <button type="button" onClick={onNewChat} className="h-8 w-8 inline-flex items-center justify-center rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
                <outline_1.PlusIcon className="h-4 w-4"/>
              </button>
              {updateBadge}
            </div>)}
          <h1 className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
            {i18n_1.skillI18n.t('skills')}
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <SkillsManager_1.default />
        </div>
      </div>
    </div>);
exports.default = SkillsView;
//# sourceMappingURL=SkillsView.js.map