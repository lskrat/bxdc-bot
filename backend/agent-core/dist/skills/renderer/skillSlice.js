"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearActiveSkills = exports.setActiveSkillIds = exports.toggleActiveSkill = exports.toggleSkill = exports.deleteSkill = exports.updateSkill = exports.addSkill = exports.setSkills = void 0;
const toolkit_1 = require("@reduxjs/toolkit");
const initialState = {
    skills: [],
    activeSkillIds: [],
};
const skillSlice = (0, toolkit_1.createSlice)({
    name: 'skill',
    initialState,
    reducers: {
        setSkills: (state, action) => {
            state.skills = action.payload;
            state.activeSkillIds = state.activeSkillIds.filter(id => action.payload.some(skill => skill.id === id));
        },
        addSkill: (state, action) => {
            state.skills.push(action.payload);
        },
        updateSkill: (state, action) => {
            const index = state.skills.findIndex(s => s.id === action.payload.id);
            if (index !== -1) {
                state.skills[index] = { ...state.skills[index], ...action.payload.updates };
            }
        },
        deleteSkill: (state, action) => {
            state.skills = state.skills.filter(s => s.id !== action.payload);
            state.activeSkillIds = state.activeSkillIds.filter(id => id !== action.payload);
        },
        toggleSkill: (state, action) => {
            const skill = state.skills.find(s => s.id === action.payload);
            if (skill) {
                skill.enabled = !skill.enabled;
            }
        },
        toggleActiveSkill: (state, action) => {
            const index = state.activeSkillIds.indexOf(action.payload);
            if (index === -1) {
                state.activeSkillIds.push(action.payload);
            }
            else {
                state.activeSkillIds.splice(index, 1);
            }
        },
        setActiveSkillIds: (state, action) => {
            state.activeSkillIds = action.payload;
        },
        clearActiveSkills: (state) => {
            state.activeSkillIds = [];
        },
    },
});
_a = skillSlice.actions, exports.setSkills = _a.setSkills, exports.addSkill = _a.addSkill, exports.updateSkill = _a.updateSkill, exports.deleteSkill = _a.deleteSkill, exports.toggleSkill = _a.toggleSkill, exports.toggleActiveSkill = _a.toggleActiveSkill, exports.setActiveSkillIds = _a.setActiveSkillIds, exports.clearActiveSkills = _a.clearActiveSkills;
exports.default = skillSlice.reducer;
//# sourceMappingURL=skillSlice.js.map