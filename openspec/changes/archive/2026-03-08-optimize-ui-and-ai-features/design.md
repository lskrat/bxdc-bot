## Context

The current application has a functional but basic UI. The user wants a modern, "surprise flat style" using Tailwind CSS for the authentication pages. Additionally, the user wants to leverage AI to personalize the experience by generating an emoji avatar from the nickname and greeting the user upon entering the chat.

## Goals / Non-Goals

**Goals:**
-   Create a visually appealing, flat-design Login and Register page using Tailwind CSS.
-   Implement an AI-driven avatar generator that maps a nickname to a relevant emoji.
-   Create a seamless registration flow that includes a "Generating avatar..." intermediate step.
-   Ensure the AI agent greets the user proactively when the chat session starts.

**Non-Goals:**
-   Full image generation (e.g., Stable Diffusion) for avatars. We will stick to emoji/text-based avatars for now to keep it lightweight and consistent with the "flat" style.
-   Complete overhaul of the entire application UI (focused on Auth and Chat entry for now).

## Decisions

-   **Styling Engine**: We will use **Tailwind CSS**. It enables rapid UI development and easy implementation of flat design principles.
-   **Avatar Generation Strategy**: Instead of generating a raster image, we will ask the LLM to select an **emoji** that best represents the user's nickname. This is fast, fits the "flat" aesthetic, and avoids complex image generation pipelines.
-   **Registration Flow State**: We will introduce a new `AvatarGeneration` step in the registration flow.
    -   Step 1: User enters credentials & nickname.
    -   Step 2: Submit to backend -> User created.
    -   Step 3: Frontend shows "Generating avatar..." animation.
    -   Step 4: Backend calls LLM to get emoji -> updates user profile.
    -   Step 5: Frontend receives completion -> shows "Go to Chat" button.
-   **Initial Greeting**: The `ChatUI` component will trigger a `generateGreeting` action on mount if the chat history is empty. The backend will use the user's nickname and avatar context to generate a friendly welcome message.

## Risks / Trade-offs

-   **Latency**: LLM calls can be slow.
    -   *Mitigation*: The "Generating avatar" screen will have an engaging animation to keep the user interested.
-   **LLM Failure**: The LLM might fail to return a valid emoji.
    -   *Mitigation*: Fallback to a random or default emoji (e.g., 👤) if the generation fails.
