const fs = require('node:fs/promises');
const path = require('node:path');
const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');

const begin = '# @generated begin bayshop-workmanager-room-reflection';
const end = '# @generated end bayshop-workmanager-room-reflection';
const rules = `${begin}
# Room 2.5 instantiates this database by reflection. R8 full mode must retain its constructor.
-keep class androidx.work.impl.WorkDatabase {
    <init>();
}
-keep class androidx.work.impl.WorkDatabase_Impl {
    public <init>();
}
${end}`;

function applyWorkManagerRoomRules(contents) {
  const starts = contents.split(begin).length - 1;
  const ends = contents.split(end).length - 1;
  if (starts !== ends || starts > 1 || (starts === 1 && contents.indexOf(end) < contents.indexOf(begin))) {
    throw new Error('Malformed BayShop WorkManager ProGuard block');
  }
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const block = rules.replace(/\n/g, newline);
  if (starts === 1) {
    return contents.slice(0, contents.indexOf(begin)) + block + contents.slice(contents.indexOf(end) + end.length);
  }
  return contents + (contents.endsWith('\n') || contents.length === 0 ? '' : newline) + newline + block + newline;
}

function withWorkManagerRoom(config) {
  return withDangerousMod(config, ['android', async mod => {
    const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    // The generated Expo Android template owns this file; fail if its structure changes.
    const current = await fs.readFile(file, 'utf8');
    const updated = applyWorkManagerRoomRules(current);
    if (updated !== current) await fs.writeFile(file, updated, 'utf8');
    return mod;
  }]);
}

module.exports = createRunOncePlugin(withWorkManagerRoom, 'bayshop-workmanager-room', '1.0.0');
module.exports.applyWorkManagerRoomRules = applyWorkManagerRoomRules;
