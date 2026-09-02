const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

function generateInviteCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  var exists = db._raw.chat_groups.some(function(g) { return g.invite_code === code; });
  return exists ? generateInviteCode() : code;
}

function generateQrData(groupId, inviteCode) {
  return JSON.stringify({ type: 'group_join', group_id: groupId, code: inviteCode, ts: Date.now() });
}

router.get('/groups', (req, res) => {
  var userId = req.user.id;
  var memberships = db._raw.chat_members.filter(function(m) { return m.user_id === userId && !m.left_at; });
  var groups = memberships.map(function(m) {
    var g = db._raw.chat_groups.find(function(x) { return x.id === m.group_id; });
    if (!g) return null;
    var lastMsg = db._raw.chat_messages.filter(function(msg) { return msg.group_id === g.id; }).sort(function(a, b) { return (b.id - a.id); })[0];
    var unread = db._raw.chat_messages.filter(function(msg) {
      return msg.group_id === g.id && msg.sender_id !== userId && msg.id > (m.last_read_msg_id || 0);
    }).length;
    return {
      id: g.id, name: g.name, avatar: g.avatar, type: g.type,
      invite_code: g.invite_code, member_count: g.member_count,
      last_message: lastMsg ? { content: lastMsg.content, sender: lastMsg.sender_name, created_at: lastMsg.created_at } : null,
      unread_count: unread,
      is_pinned: m.is_pinned, is_muted: m.is_muted,
      my_nickname: m.nickname, my_remark: m.remark
    };
  }).filter(Boolean);
  groups.sort(function(a, b) {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return 0;
  });
  res.json({ groups: groups });
});

router.post('/groups', (req, res) => {
  var userId = req.user.id;
  var name = (req.body.name || '').trim();
  var classCode = req.body.class_code || '';
  var type = req.body.type || 'class';
  if (!name) return res.status(400).json({ error: '群聊名称不能为空' });

  var inviteCode = generateInviteCode();
  var groupId = (db._seq.chat_groups || 0) + 1;
  db._seq.chat_groups = groupId;
  var now = new Date().toISOString();

  db._raw.chat_groups.push({
    id: groupId, name: name, avatar: '', type: type,
    class_code: classCode, invite_code: inviteCode,
    qr_data: generateQrData(groupId, inviteCode),
    owner_id: userId, member_count: 1,
    created_at: now, updated_at: now
  });

  var memberId = (db._seq.chat_members || 0) + 1;
  db._seq.chat_members = memberId;
  db._raw.chat_members.push({
    id: memberId, group_id: groupId, user_id: userId,
    role: 'owner', nickname: '', remark: '',
    is_pinned: 0, is_muted: 0,
    last_read_msg_id: 0, chat_bg: '',
    joined_at: now, left_at: null
  });

  db._saveNow();
  res.json({ success: true, group: { id: groupId, name: name, invite_code: inviteCode, qr_data: db._raw.chat_groups[db._raw.chat_groups.length - 1].qr_data } });
});

router.get('/groups/:id', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var group = db._raw.chat_groups.find(function(g) { return g.id === groupId; });
  if (!group) return res.status(404).json({ error: '群聊不存在' });

  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  res.json({
    id: group.id, name: group.name, avatar: group.avatar, type: group.type,
    invite_code: group.invite_code, qr_data: group.qr_data,
    owner_id: group.owner_id, member_count: group.member_count,
    created_at: group.created_at,
    my_nickname: membership.nickname, my_remark: membership.remark,
    is_pinned: membership.is_pinned, is_muted: membership.is_muted,
    chat_bg: membership.chat_bg
  });
});

router.post('/groups/:id/join', (req, res) => {
  var userId = req.user.id;
  var groupId = parseInt(req.params.id);
  var group = db._raw.chat_groups.find(function(g) { return g.id === groupId; });
  if (!group) return res.status(404).json({ error: '群聊不存在' });

  var existing = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId;
  });
  if (existing && !existing.left_at) return res.status(400).json({ error: '您已在群聊中' });

  var now = new Date().toISOString();
  if (existing) {
    existing.left_at = null;
    existing.joined_at = now;
  } else {
    var memberId = (db._seq.chat_members || 0) + 1;
    db._seq.chat_members = memberId;
    db._raw.chat_members.push({
      id: memberId, group_id: groupId, user_id: userId,
      role: 'member', nickname: '', remark: '',
      is_pinned: 0, is_muted: 0,
      last_read_msg_id: 0, chat_bg: '',
      joined_at: now, left_at: null
    });
  }
  group.member_count = db._raw.chat_members.filter(function(m) {
    return m.group_id === groupId && !m.left_at;
  }).length;
  db._saveNow();

  var memberId2 = (db._seq.chat_messages || 0) + 1;
  db._seq.chat_messages = memberId2;
  var user = db._raw.users.find(function(u) { return u.id === userId; });
  db._raw.chat_messages.push({
    id: memberId2, group_id: groupId, sender_id: 0,
    sender_name: '系统', content: (user ? user.username : '某人') + ' 加入了群聊',
    type: 'system', created_at: now
  });
  db._saveNow();
  res.json({ success: true, group: { id: group.id, name: group.name } });
});

router.post('/groups/join-by-code', (req, res) => {
  var code = (req.body.code || '').trim().toUpperCase();
  var userId = req.user.id;
  var group = db._raw.chat_groups.find(function(g) { return g.invite_code === code; });
  if (!group) return res.status(404).json({ error: '邀请码无效' });
  req.params.id = group.id;
  return router.handle(req, res);
});

router.post('/groups/:id/leave', (req, res) => {
  var userId = req.user.id;
  var groupId = parseInt(req.params.id);
  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(400).json({ error: '您不在该群聊中' });

  membership.left_at = new Date().toISOString();
  var group = db._raw.chat_groups.find(function(g) { return g.id === groupId; });
  if (group) {
    group.member_count = db._raw.chat_members.filter(function(m) {
      return m.group_id === groupId && !m.left_at;
    }).length;
  }
  var memberId = (db._seq.chat_messages || 0) + 1;
  db._seq.chat_messages = memberId;
  var user = db._raw.users.find(function(u) { return u.id === userId; });
  db._raw.chat_messages.push({
    id: memberId, group_id: groupId, sender_id: 0,
    sender_name: '系统', content: (user ? user.username : '某人') + ' 退出了群聊',
    type: 'system', created_at: new Date().toISOString()
  });
  db._saveNow();
  res.json({ success: true });
});

router.get('/groups/:id/messages', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var lastId = parseInt(req.query.after) || 0;
  var limit = parseInt(req.query.limit) || 50;

  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  var messages = db._raw.chat_messages.filter(function(msg) {
    return msg.group_id === groupId && msg.id > lastId;
  }).sort(function(a, b) { return a.id - b.id; }).slice(-limit);

  if (messages.length > 0) {
    membership.last_read_msg_id = messages[messages.length - 1].id;
    db._saveNow();
  }

  var members = db._raw.chat_members.filter(function(m) {
    return m.group_id === groupId && !m.left_at;
  }).map(function(m) {
    var u = db._raw.users.find(function(x) { return x.id === m.user_id; });
    return {
      id: m.user_id, username: u ? u.username : '未知用户',
      role: u ? u.role : '', nickname: m.nickname || '',
      member_role: m.role
    };
  });

  res.json({ messages: messages, members: members });
});

router.post('/groups/:id/messages', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var content = (req.body.content || '').trim();
  var type = req.body.type || 'text';

  if (!content && type === 'text') return res.status(400).json({ error: '消息内容不能为空' });

  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  var user = db._raw.users.find(function(u) { return u.id === userId; });
  var senderName = membership.nickname || (user ? user.username : '未知');
  var msgId = (db._seq.chat_messages || 0) + 1;
  db._seq.chat_messages = msgId;
  var now = new Date().toISOString();

  var msg = {
    id: msgId, group_id: groupId, sender_id: userId,
    sender_name: senderName, content: content,
    type: type, created_at: now
  };
  db._raw.chat_messages.push(msg);

  var group = db._raw.chat_groups.find(function(g) { return g.id === groupId; });
  if (group) group.updated_at = now;
  membership.last_read_msg_id = msgId;
  db._saveNow();

  res.json({ success: true, message: msg });
});

router.get('/groups/:id/members', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  var members = db._raw.chat_members.filter(function(m) {
    return m.group_id === groupId && !m.left_at;
  }).map(function(m) {
    var u = db._raw.users.find(function(x) { return x.id === m.user_id; });
    return {
      id: m.user_id, username: u ? u.username : '未知用户',
      role: u ? u.role : '', nickname: m.nickname || '',
      member_role: m.role, joined_at: m.joined_at
    };
  });
  res.json({ members: members });
});

router.put('/groups/:id/settings', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  if (req.body.nickname !== undefined) membership.nickname = req.body.nickname;
  if (req.body.remark !== undefined) membership.remark = req.body.remark;
  if (req.body.is_pinned !== undefined) membership.is_pinned = req.body.is_pinned ? 1 : 0;
  if (req.body.is_muted !== undefined) membership.is_muted = req.body.is_muted ? 1 : 0;
  if (req.body.chat_bg !== undefined) membership.chat_bg = req.body.chat_bg;
  db._saveNow();
  res.json({ success: true });
});

router.delete('/groups/:id/messages', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership) return res.status(403).json({ error: '您不是该群聊成员' });

  membership.last_read_msg_id = (db._seq.chat_messages || 0);
  db._saveNow();
  res.json({ success: true, message: '聊天记录已清空' });
});

router.get('/groups/:id/qr', (req, res) => {
  var groupId = parseInt(req.params.id);
  var group = db._raw.chat_groups.find(function(g) { return g.id === groupId; });
  if (!group) return res.status(404).json({ error: '群聊不存在' });
  res.json({ qr_data: group.qr_data, invite_code: group.invite_code, name: group.name });
});

router.post('/groups/join-by-qr', (req, res) => {
  var qrData = req.body.qr_data || '';
  var userId = req.user.id;
  var parsed;
  try { parsed = JSON.parse(qrData); } catch(e) { return res.status(400).json({ error: '无效的二维码数据' }); }
  if (parsed.type !== 'group_join') return res.status(400).json({ error: '不是群聊二维码' });
  var group = db._raw.chat_groups.find(function(g) { return g.id === parsed.group_id; });
  if (!group) return res.status(404).json({ error: '群聊不存在' });

  var existing = db._raw.chat_members.find(function(m) {
    return m.group_id === group.id && m.user_id === userId;
  });
  if (existing && !existing.left_at) return res.status(400).json({ error: '您已在群聊中' });

  var now = new Date().toISOString();
  if (existing) { existing.left_at = null; existing.joined_at = now; }
  else {
    var memberId = (db._seq.chat_members || 0) + 1;
    db._seq.chat_members = memberId;
    db._raw.chat_members.push({
      id: memberId, group_id: group.id, user_id: userId,
      role: 'member', nickname: '', remark: '',
      is_pinned: 0, is_muted: 0, last_read_msg_id: 0,
      chat_bg: '', joined_at: now, left_at: null
    });
  }
  group.member_count = db._raw.chat_members.filter(function(m) {
    return m.group_id === group.id && !m.left_at;
  }).length;
  var msgId = (db._seq.chat_messages || 0) + 1;
  db._seq.chat_messages = msgId;
  var user = db._raw.users.find(function(u) { return u.id === userId; });
  db._raw.chat_messages.push({
    id: msgId, group_id: group.id, sender_id: 0,
    sender_name: '系统', content: (user ? user.username : '某人') + ' 通过扫码加入群聊',
    type: 'system', created_at: now
  });
  db._saveNow();
  res.json({ success: true, group: { id: group.id, name: group.name } });
});

router.get('/groups/:id/announcements', (req, res) => {
  var groupId = parseInt(req.params.id);
  var anns = db._raw.chat_announcements.filter(function(a) { return a.group_id === groupId; })
    .sort(function(a, b) { return b.id - a.id; });
  res.json({ announcements: anns });
});

router.post('/groups/:id/announcements', (req, res) => {
  var groupId = parseInt(req.params.id);
  var userId = req.user.id;
  var content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '公告内容不能为空' });

  var membership = db._raw.chat_members.find(function(m) {
    return m.group_id === groupId && m.user_id === userId && !m.left_at;
  });
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return res.status(403).json({ error: '只有群主或管理员可以发布公告' });
  }
  var annId = (db._seq.chat_announcements || 0) + 1;
  db._seq.chat_announcements = annId;
  var user = db._raw.users.find(function(u) { return u.id === userId; });
  db._raw.chat_announcements.push({
    id: annId, group_id: groupId, content: content,
    publisher_id: userId, publisher_name: user ? user.username : '未知',
    created_at: new Date().toISOString()
  });
  db._saveNow();
  res.json({ success: true, announcement: db._raw.chat_announcements[db._raw.chat_announcements.length - 1] });
});

module.exports = router;
