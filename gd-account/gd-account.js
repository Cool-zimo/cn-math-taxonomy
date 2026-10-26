/**
 * gd-account —— 与 GitHub Drive 同款的账号系统（精简移植）
 *
 * ★ 为什么自成一个目录、且不改上游任何文件：
 *   本仓库会自动同步上游 xiaoyang111222/cn-math-taxonomy（见
 *   .github/workflows/sync-upstream.yml）。凡是散落在上游文件里的改动，
 *   都会在同步时被覆盖 —— 而且覆盖得悄无声息。
 *   所以本目录是「同步免疫区」：只增不改，上游碰不到。
 *   index.html 里那一行 <script> 由 sync 流程自动重新注入，
 *   上游改了 index.html 也能自己长回来。
 *
 * ★ 与 Drive 保持一致的几处判据（抄过来时逐条核对过）：
 *   - token 前缀必须是 ghp_ 或 github_pat_
 *   - ghp_ 严格 40 位；github_pat_ 不少于 100 位
 *   - 401 不一律说"token 坏了"：多账号下更常见的是拿 A 的身份去写 B 的仓库
 *   - 403 要区分限流和真权限不足（国内网络下限流是常态，
 *     一律报"权限不足"会把人引去重新申请令牌，白折腾）
 */

(function (global) {
    'use strict';

    var API = 'https://api.github.com';
    var K_TOKEN = 'gd_account_token';
    var K_USER = 'gd_account_user';
    var K_ACCOUNTS = 'gd_account_accounts';
    var K_GIST = 'gd_account_gist_id';
    var PROGRESS_FILE = 'cnmt-progress.json';

    // ── token 格式校验：与 Drive 同一套判据 ──────────────────────
    function checkFormat(token) {
        token = String(token || '').trim();
        if (!token) return '请输入 Token';
        if (token.indexOf('ghp_') === 0) {
            // classic token 固定 40 位
            if (token.length !== 40) return 'ghp_ 开头的 Token 应为 40 位，当前 ' + token.length + ' 位';
            return null;
        }
        if (token.indexOf('github_pat_') === 0) {
            // fine-grained 通常 100 位以上
            if (token.length < 100) return 'github_pat_ 开头的 Token 至少 100 位，当前 ' + token.length + ' 位';
            return null;
        }
        return 'Token 需以 ghp_ 或 github_pat_ 开头';
    }

    // ── 网络：把 403 限流和 403 权限不足分开 ────────────────────
    function request(path, token, options) {
        options = options || {};
        var headers = {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'cnmt-account'
        };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (options.body) headers['Content-Type'] = 'application/json';

        return fetch(API + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        }).then(function (r) {
            var limit = r.headers.get('x-ratelimit-remaining');
            var reset = r.headers.get('x-ratelimit-reset');
            if (r.status === 403 && limit === '0') {
                var err = new Error('API 限流（不是权限问题）。剩余 0 次' +
                    (reset ? '，将于 ' + new Date(parseInt(reset, 10) * 1000).toLocaleTimeString() + ' 恢复' : ''));
                err.status = 403;
                err.rateLimited = true;
                throw err;
            }
            return r.json().then(function (j) {
                if (!r.ok) {
                    var msg = (j && j.message) || ('HTTP ' + r.status);
                    // GitHub 会把具体原因放在 errors[] 里，光看 message 看不出来
                    if (j && j.errors && j.errors.length && j.errors[0].message) {
                        msg += '（' + j.errors[0].message + '）';
                    }
                    var e = new Error(msg);
                    e.status = r.status;
                    throw e;
                }
                return j;
            });
        });
    }

    function getMe(token) {
        return request('/user', token);
    }

    // ── 进度存到 Gist ──────────────────────────────────────────
    // 为什么是 Gist 而不是仓库：诊断进度是个人小数据，
    // 为它建一个仓库太重；Gist 天然私有且能按 id 精确读写。
    function findProgressGist(token) {
        return request('/gists?per_page=100', token).then(function (list) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].files && list[i].files[PROGRESS_FILE]) return list[i];
            }
            return null;
        });
    }

    function saveProgress(token, data) {
        var gistId = localStorage.getItem(K_GIST);
        var body = { files: {} };
        body.files[PROGRESS_FILE] = { content: JSON.stringify(data, null, 2) };

        if (gistId) {
            return request('/gists/' + gistId, token, { method: 'PATCH', body: body })
                .catch(function (e) {
                    // gist 可能在别处被删了 —— 不能让进度就此丢失，重建一个
                    if (e.status === 404) {
                        localStorage.removeItem(K_GIST);
                        return createProgressGist(token, data);
                    }
                    throw e;
                });
        }
        return createProgressGist(token, data);
    }

    function createProgressGist(token, data) {
        var body = {
            // public:false 才是私密 gist。不写默认是公开的 ——
            // 学习进度里含"哪些知识点不会"，不该被搜到。
            public: false,
            description: '中小学知识图谱 · 学习进度',
            files: {}
        };
        body.files[PROGRESS_FILE] = { content: JSON.stringify(data, null, 2) };
        return request('/gists', token, { method: 'POST', body: body })
            .then(function (g) {
                localStorage.setItem(K_GIST, g.id);
                return g;
            });
    }

    function loadProgress(token) {
        var gistId = localStorage.getItem(K_GIST);
        var p = gistId
            ? request('/gists/' + gistId, token).catch(function () { return null; })
            : findProgressGist(token);
        return p.then(function (g) {
            if (!g) return null;
            localStorage.setItem(K_GIST, g.id);
            var f = g.files && g.files[PROGRESS_FILE];
            if (!f) return null;
            // gist 文件超过 1MB 时 content 会被截断，只给 raw_url
            if (f.content) return JSON.parse(f.content);
            if (f.raw_url) {
                return fetch(f.raw_url).then(function (r) { return r.json(); })
                    .catch(function () { return null; });
            }
            return null;
        });
    }

    // ── 多账号（与 Drive 同一套结构） ──────────────────────────
    function listAccounts() {
        try { return JSON.parse(localStorage.getItem(K_ACCOUNTS) || '[]'); }
        catch (e) { return []; }
    }

    function addAccount(token, user) {
        var accounts = listAccounts();
        var id = (user && user.login) || token.substring(0, 8);
        for (var i = 0; i < accounts.length; i++) {
            if (accounts[i].id === id) { accounts[i].token = token; accounts[i].user = user; }
        }
        if (!accounts.some(function (a) { return a.id === id; })) {
            accounts.push({ id: id, token: token, user: user });
        }
        localStorage.setItem(K_ACCOUNTS, JSON.stringify(accounts));
    }

    function removeAccount(id) {
        var accounts = listAccounts().filter(function (a) { return a.id !== id; });
        localStorage.setItem(K_ACCOUNTS, JSON.stringify(accounts));
        if (getCurrentUser() && getCurrentUser().login === id) logout();
    }

    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem(K_USER) || 'null'); }
        catch (e) { return null; }
    }

    function getToken() { return localStorage.getItem(K_TOKEN) || ''; }

    function logout() {
        localStorage.removeItem(K_TOKEN);
        localStorage.removeItem(K_USER);
        localStorage.removeItem(K_GIST);
    }

    function login(token) {
        token = String(token || '').trim();
        var bad = checkFormat(token);
        if (bad) return Promise.reject(new Error(bad));
        return getMe(token).then(function (user) {
            localStorage.setItem(K_TOKEN, token);
            localStorage.setItem(K_USER, JSON.stringify(user));
            addAccount(token, user);
            return user;
        });
    }

    global.GdAccount = {
        login: login,
        logout: logout,
        getToken: getToken,
        getCurrentUser: getCurrentUser,
        listAccounts: listAccounts,
        removeAccount: removeAccount,
        checkFormat: checkFormat,
        saveProgress: saveProgress,
        loadProgress: loadProgress,
        PROGRESS_FILE: PROGRESS_FILE
    };
})(window);
