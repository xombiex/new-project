// Vercel build: Convoy web app at the root, static pages from web/ (terms, privacy, logo), admin portal at /admin.
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
execSync('npx expo export --platform web', { stdio: 'inherit' });
cpSync('web', 'dist', { recursive: true });
cpSync('admin', 'dist/admin', { recursive: true });
