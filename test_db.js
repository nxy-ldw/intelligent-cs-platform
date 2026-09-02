const db = require('./config/database');
console.log('Tables:', Object.keys(db._raw).filter(k => !k.startsWith('_')).join(', '));
console.log('Has settings:', 'settings' in db._raw);
console.log('Has system_config:', 'system_config' in db._raw);
const sc = db._raw.system_config || [];
console.log('system_config entries:', sc.length);
if (sc.length > 0) console.log('First entry:', JSON.stringify(sc[0]));
