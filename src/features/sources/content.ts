// Text for the Sources & AI use page that is not stored in the app's tables.

/** Licenses checked against each package's own package.json (node_modules) on 2026-11-15. */
export const LIBRARIES: { name: string; use: string; license: string }[] = [
  { name: 'React and React DOM', use: 'the user interface', license: 'MIT' },
  { name: 'Dexie.js and dexie-react-hooks', use: 'storage on the device (IndexedDB)', license: 'Apache-2.0' },
  { name: 'vite-plugin-pwa and Workbox', use: 'works offline, installable', license: 'MIT' },
  { name: 'Vite', use: 'build tool', license: 'MIT' },
  { name: 'Vitest', use: 'automated tests', license: 'MIT' },
  { name: 'TypeScript', use: 'language', license: 'Apache-2.0' },
  { name: 'ESLint', use: 'code checks', license: 'MIT' },
  { name: 'Inter, Space Grotesk, IBM Plex Mono', use: 'fonts, bundled through Fontsource', license: 'SIL OFL 1.1' },
]

/**
 * The team's AI-use declaration (issue #31, dossier R-03). Written by the team, not generated.
 * Paragraphs separated by a blank line. null = not written yet: the section is then hidden in the published app.
 */
export const AI_USE_DECLARATION: string | null =
  'Our team designed, architected, and built VitalisX, including its product requirements, baseline algorithms, database schemas, scientific validations, and user flows and interface specifications. During development, we used GitHub Copilot, Claude, and Gemini strictly as productivity assistants to ensure a fluid flow in our code generation process. We also used these AI tools for debugging assistance, English grammar editing, and summarizing peer-reviewed literature. Our team wrote, tested, and verified all core logic, clinical rules, and design decisions. All crew health data in the application was created by our team and is simulated for demonstration purposes.'
