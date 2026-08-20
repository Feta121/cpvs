// The real implementation now lives in InstallPromptContext (a Context
// Provider mounted once at the app root — see main.tsx) instead of here.
// This file used to contain a standalone hook, but each consumer of a
// standalone hook gets its *own* independent state and event listener,
// and `beforeinstallprompt` only ever fires once per page load — so only
// whichever consumer happened to be mounted first actually saw it. Kept
// as a thin re-export so existing imports (InstallPrompt.tsx, Settings.tsx)
// don't need to change.
export { useInstallPrompt, isStandalone, isIOS, getInstallInstructions } from '../context/InstallPromptContext';
