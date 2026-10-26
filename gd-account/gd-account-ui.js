/**
 * gd-account UI —— 右上角账号按钮 + 登录弹窗 + 进度同步
 *
 * 挂在 body 右上角，用 fixed 定位。不写入上游 DOM 结构 ——
 * 上游的 index.html / diagnose/index.html 结构各不相同，
 * 靠 appendChild 挂自己的容器才不会互相踩。
 *
 * ★ 唯一改上游文件的地方是 index.html 末尾的一行 <script>，
 *   而那一行由 sync-upstream.yml 在每次同步后自动重新注入，
 *   所以上游怎么改 index.html 都不影响这里。
 */
(function () {
    'use strict';

    var A = window.GdAccount;
    if (!A) { console.warn('[gd-account] 核心未加载'); return; }

    var CSS = [
        '.gd-ac-btn{position:fixed;top:12px;right:12px;z-index:9998;display:flex;align-items:center;gap:6px;',
        'padding:5px 10px;border-radius:18px;border:1px solid rgba(15,110,98,.35);background:#fff;',
        'color:#0f6e62;font-size:13px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12);font-family:inherit}',
        '.gd-ac-btn img{width:20px;height:20px;border-radius:50%;display:block}',
        '.gd-ac-mask{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:none;',
        'align-items:center;justify-content:center;padding:16px}',
        '.gd-ac-mask.on{display:flex}',
        '.gd-ac-box{background:#fff;border-radius:12px;padding:20px;width:100%;max-width:360px;',
        'box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:inherit}',
        '.gd-ac-box h3{margin:0 0 12px;font-size:16px;color:#0f6e62}',
        '.gd-ac-box input{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #d1d5db;',
        'border-radius:8px;font-size:13px;font-family:ui-monospace,monospace}',
        '.gd-ac-tip{font-size:12px;color:#6b7280;line-height:1.6;margin:10px 0 0}',
        '.gd-ac-tip a{color:#0f6e62}',
        '.gd-ac-row{display:flex;gap:8px;margin-top:14px}',
        '.gd-ac-row button{flex:1;padding:9px;border:none;border-radius:8px;font-size:14px;cursor:pointer;',
        'font-family:inherit}',
        '.gd-ac-ok{background:#0f6e62;color:#fff}',
        '.gd-ac-cancel{background:#f3f4f6;color:#374151}',
        '.gd-ac-msg{font-size:12px;margin-top:10px;line-height:1.5;word-break:break-all}',
        '.gd-ac-acct{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;',
        'border-radius:8px;margin-bottom:6px;cursor:pointer}',
        '.gd-ac-acct img{width:24px;height:24px;border-radius:50%}',
        '.gd-ac-acct:hover{background:#f9fafb}',
        '.gd-ac-acct .nm{flex:1;font-size:13px}',
        '.gd-ac-acct .del{color:#dc2626;font-size:12px;padding:2px 6px}'
    ].join('');

    function injectCss() {
        var s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    var mask, box;

    function close() { if (mask) mask.classList.remove('on'); }

    function show(html) {
        if (!mask) {
            mask = document.createElement('div');
            mask.className = 'gd-ac-mask';
            box = document.createElement('div');
            box.className = 'gd-ac-box';
            mask.appendChild(box);
            mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
            document.body.appendChild(mask);
        }
        box.innerHTML = html;
        mask.classList.add('on');
        return box;
    }

    function toast(el, msg, bad) {
        if (!el) return;
        el.textContent = msg;
        el.style.color = bad ? '#dc2626' : '#059669';
    }

    // ── 已登录：账号面板 ───────────────────────────────────────
    function showPanel(user) {
        var accounts = A.listAccounts();
        var others = accounts.filter(function (a) { return !user || a.id !== user.login; });

        var html = '<h3>账号</h3>';
        html += '<div class="gd-ac-acct" style="cursor:default">' +
            '<img src="' + esc(user.avatar_url) + '" alt="">' +
            '<div class="nm">' + esc(user.login) + '<br><span style="font-size:11px;color:#6b7280">当前登录</span></div>' +
            '</div>';

        if (others.length) {
            html += '<div style="font-size:12px;color:#6b7280;margin:10px 0 6px">切换账号</div>';
            others.forEach(function (a) {
                html += '<div class="gd-ac-acct" data-switch="' + esc(a.id) + '">' +
                    '<img src="' + esc((a.user && a.user.avatar_url) || '') + '" alt="">' +
                    '<div class="nm">' + esc(a.id) + '</div>' +
                    '<span class="del" data-del="' + esc(a.id) + '">删除</span></div>';
            });
        }

        html += '<div class="gd-ac-row">' +
            '<button class="gd-ac-ok" id="gd-ac-save">保存进度到 Gist</button>' +
            '<button class="gd-ac-cancel" id="gd-ac-out">退出</button></div>';
        html += '<div class="gd-ac-msg" id="gd-ac-msg"></div>';

        var b = show(html);
        var msgEl = b.querySelector('#gd-ac-msg');

        b.querySelectorAll('[data-switch]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.hasAttribute('data-del')) return;
                var id = el.getAttribute('data-switch');
                var acc = accounts.filter(function (a) { return a.id === id; })[0];
                if (!acc) return;
                toast(msgEl, '正在切换…');
                A.login(acc.token).then(function (u) {
                    close(); render(); toast(document.getElementById('gd-ac-msg'), '已切换到 ' + u.login);
                }).catch(function (err) {
                    toast(msgEl, '切换失败：' + err.message, true);
                });
            });
        });

        b.querySelectorAll('[data-del]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                A.removeAccount(el.getAttribute('data-del'));
                render();
            });
        });

        b.querySelector('#gd-ac-out').addEventListener('click', function () {
            A.logout(); close(); render();
        });

        b.querySelector('#gd-ac-save').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true; btn.textContent = '保存中…';
            // 进度取自页面里已有的诊断结果；拿不到就只存时间戳，
            // 绝不因为取不到数据就报错 —— 那会把人吓退。
            var data = collectProgress();
            A.saveProgress(A.getToken(), data).then(function (g) {
                toast(msgEl, '已保存到私密 Gist：' + g.id);
                btn.disabled = false; btn.textContent = '保存进度到 Gist';
            }).catch(function (err) {
                toast(msgEl, '保存失败：' + err.message, true);
                btn.disabled = false; btn.textContent = '保存进度到 Gist';
            });
        });
    }

    // ── 收集进度：从 localStorage 里捞诊断痕迹 ──────────────────
    // 上游把诊断状态存在自己的 key 里，我们只做快照、不改判据。
    function collectProgress() {
        var snap = { savedAt: new Date().toISOString(), app: 'cn-math-taxonomy', data: {} };
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                // 跳过凭据本身 —— 进度里绝不能带上 token，
                // 一旦 gist 哪天被误设成公开就是泄露。
                if (!k || k.indexOf('gd_account_token') === 0) continue;
                if (k === 'gd_account_accounts') continue;
                var v = localStorage.getItem(k);
                if (v && v.length < 200000) snap.data[k] = v;
            }
        } catch (e) { /* 存不下就算了，不阻断 */ }
        return snap;
    }

    // ── 未登录：登录框 ─────────────────────────────────────────
    function showLogin() {
        var accounts = A.listAccounts();
        var html = '<h3>登录（GitHub Token）</h3>';

        if (accounts.length) {
            html += '<div style="font-size:12px;color:#6b7280;margin-bottom:8px">已保存的账号</div>';
            accounts.forEach(function (a) {
                html += '<div class="gd-ac-acct" data-use="' + esc(a.id) + '">' +
                    '<img src="' + esc((a.user && a.user.avatar_url) || '') + '" alt="">' +
                    '<div class="nm">' + esc(a.id) + '</div>' +
                    '<span class="del" data-del2="' + esc(a.id) + '">删除</span></div>';
            });
            html += '<div style="font-size:12px;color:#6b7280;margin:12px 0 8px">或用新 Token 登录</div>';
        }

        html += '<input id="gd-ac-token" type="password" placeholder="ghp_... 或 github_pat_..." autocomplete="off">';
        html += '<p class="gd-ac-tip">需要 <b>gist</b> 权限用于保存学习进度。' +
            '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">点此申请</a>' +
            '（Fine-grained 请只勾 Gists 读写）</p>';
        html += '<div class="gd-ac-row">' +
            '<button class="gd-ac-ok" id="gd-ac-go">登录</button>' +
            '<button class="gd-ac-cancel" id="gd-ac-x">取消</button></div>';
        html += '<div class="gd-ac-msg" id="gd-ac-msg"></div>';

        var b = show(html);
        var msgEl = b.querySelector('#gd-ac-msg');
        var input = b.querySelector('#gd-ac-token');

        b.querySelectorAll('[data-use]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.hasAttribute('data-del2')) return;
                var id = el.getAttribute('data-use');
                var acc = accounts.filter(function (a) { return a.id === id; })[0];
                if (!acc) return;
                toast(msgEl, '正在登录…');
                A.login(acc.token).then(function () { close(); render(); })
                    .catch(function (err) { toast(msgEl, '登录失败：' + err.message, true); });
            });
        });
        b.querySelectorAll('[data-del2]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                A.removeAccount(el.getAttribute('data-del2'));
                render();
            });
        });

        b.querySelector('#gd-ac-x').addEventListener('click', close);
        b.querySelector('#gd-ac-go').addEventListener('click', function () {
            doLogin(input.value, msgEl, this);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doLogin(input.value, msgEl, b.querySelector('#gd-ac-go'));
        });
        setTimeout(function () { input.focus(); }, 50);
    }

    function doLogin(val, msgEl, btn) {
        var bad = A.checkFormat(val);
        if (bad) { toast(msgEl, bad, true); return; }
        btn.disabled = true; btn.textContent = '验证中…';
        toast(msgEl, '正在验证…');
        A.login(val).then(function (u) {
            close(); render();
            // 登录后自动拉一次进度，有就恢复
            A.loadProgress(A.getToken()).then(function (p) {
                if (p && p.data) {
                    Object.keys(p.data).forEach(function (k) {
                        try { localStorage.setItem(k, p.data[k]); } catch (e) { /* 忽略 */ }
                    });
                }
            }).catch(function () { /* 拉不到不影响使用 */ });
        }).catch(function (err) {
            var m = err.message || String(err);
            // 401 不一定是 token 坏了 —— 这句提示抄自 Drive，别简化掉
            if (err.status === 401) m = 'Token 无效或已过期（若刚换过账号，也可能是身份未同步）';
            if (err.status === 403 && !err.rateLimited) m = '权限不足：' + m + '（需要 gist 权限）';
            toast(msgEl, m, true);
            btn.disabled = false; btn.textContent = '登录';
        });
    }

    var btn;
    function render() {
        var user = A.getCurrentUser();
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'gd-ac-btn';
            btn.addEventListener('click', function () {
                var u = A.getCurrentUser();
                if (u) showPanel(u); else showLogin();
            });
            document.body.appendChild(btn);
        }
        if (user) {
            btn.innerHTML = '<img src="' + esc(user.avatar_url) + '" alt="">' + esc(user.login);
            btn.title = '已登录：' + user.login;
        } else {
            btn.innerHTML = '👤 登录';
            btn.title = '用 GitHub Token 登录，保存学习进度';
        }
    }

    function init() {
        injectCss();
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
