// Local admin portal: http://localhost:8092 (copies supabase-js next to the portal first).
import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'admin/supabase.js');
execSync('npx --yes serve admin --listen 8092', { stdio: 'inherit' });
