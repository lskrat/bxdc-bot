## Why

The current user interface for registration and login is unappealing, and the application lacks personalized AI features that could enhance user engagement. Improving the UI with a modern, flat design and integrating AI capabilities like emoji avatar generation and initial greetings will make the onboarding experience smoother and more delightful.

## What Changes

- **UI Redesign**: completely overhaul Login and Register pages using Tailwind CSS for a "surprise flat style".
- **AI Avatar**: Implement AI-powered emoji avatar generation based on the user's nickname during registration.
- **Registration Flow**: Add a "Generating avatar..." intermediate state after registration, before redirecting to the chat.
- **Chat Greeting**: Automatically generate a personalized greeting message from the AI when the user first enters the chat.

## Capabilities

### New Capabilities
- `ai-avatar-generator`: A service or module that uses an LLM to generate an emoji based on a text input (nickname).

### Modified Capabilities
- `user-auth`: Update the registration flow to trigger avatar generation and handle the new intermediate UI state. Redesign the login/register screens.
- `chat-ui`: Update the chat interface to display an initial AI-generated greeting upon first entry.

## Impact

- **Frontend**: Significant changes to Login, Register, and Chat pages. Introduction of Tailwind CSS (if not fully utilized yet) or extensive use of it.
- **Backend**: New endpoint or service method for avatar generation and greeting generation.
- **Database**: May need to store the generated avatar URL/character if not already supported (likely `user-profile` update, but included in `user-auth` flow changes).
