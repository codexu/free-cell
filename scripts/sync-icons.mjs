import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const icons = join(root, 'src-tauri/icons');
const iosCatalog = join(root, 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset');
const androidRes = join(root, 'src-tauri/gen/android/app/src/main/res');

// Tauri generates icons separately from the platform projects. Initialization
// can replace those projects' assets with the template icons again.
if (existsSync(join(iosCatalog, 'Contents.json'))) {
  const catalog = JSON.parse(readFileSync(join(iosCatalog, 'Contents.json'), 'utf8'));
  for (const entry of catalog.images) {
    if (entry.filename) copyFileSync(join(icons, 'ios', entry.filename), join(iosCatalog, entry.filename));
  }
  console.log('已同步 iPhone、iPad 和 App Store 图标');
}

if (existsSync(androidRes)) {
  cpSync(join(icons, 'android'), androidRes, { recursive: true });
  // Round launchers use the same adaptive foreground and background layers.
  copyFileSync(join(androidRes, 'mipmap-anydpi-v26/ic_launcher.xml'), join(androidRes, 'mipmap-anydpi-v26/ic_launcher_round.xml'));
  console.log('已同步 Android 各密度和自适应图标');
}

mkdirSync(join(root, 'public'), { recursive: true });
copyFileSync(join(root, 'app-icon.svg'), join(root, 'public/favicon.svg'));
