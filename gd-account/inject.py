#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 gd-account 注入到各 index.html

★ 为什么必须有这个脚本：
  本仓库会自动同步上游（sync-upstream.yml）。上游一改 index.html，
  我们加的那两行 <script> 就没了 —— 而且是静默消失，没人会发现。
  所以每次同步后都跑一次本脚本，把注入补回去。

★ 幂等：已经有 gd-account 标签就跳过，不会重复插入。
★ 不改上游其它任何内容 —— 只加这两行。
"""
import os
import re
import sys

# 脚本在 gd-account/ 下，仓库根是再上一层
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 注入点：所有会被访问的入口页
TARGETS = ['index.html', 'diagnose/index.html', 'explore/index.html']

TAG = ('<!-- gd-account:begin -->\n'
       '<script src="gd-account/gd-account.js"></script>\n'
       '<script src="gd-account/gd-account-ui.js"></script>\n'
       '<!-- gd-account:end -->')

MARK = 'gd-account/gd-account.js'


def inject(path):
    if not os.path.isfile(path):
        return 'skip'
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        s = f.read()

    if MARK in s:
        return 'already'

    # 相对路径：子目录页要 ../gd-account/
    #
    # ★ 这里曾经踩过一次：直接对 path（绝对路径）数斜杠，
    #   /data/workspace/cnmt/index.html 有 4 个 '/'，于是根目录页也被
    #   算成 4 层深，注入出 ../../../../gd-account/ 这种不存在的路径。
    #   必须用**相对仓库根**的路径来数，绝对路径的斜杠数量跟
    #   目录深度毫无关系。
    rel = os.path.relpath(path, ROOT)
    depth = rel.count('/')
    prefix = '../' * depth
    tag = TAG.replace('"gd-account/', '"%sgd-account/' % prefix) if depth else TAG

    if '</body>' in s:
        s = s.replace('</body>', tag + '\n</body>', 1)
    else:
        s = s + '\n' + tag
    with open(path, 'w', encoding='utf-8') as f:
        f.write(s)
    return 'injected'


def strip(path):
    """反向操作：把注入内容去掉，用于和上游做纯净对比。"""
    if not os.path.isfile(path):
        return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        s = f.read()
    s = re.sub(r'\s*<!-- gd-account:begin -->.*?<!-- gd-account:end -->', '', s, flags=re.S)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(s)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'inject'
    for t in TARGETS:
        p = os.path.join(ROOT, t)
        r = inject(p) if cmd == 'inject' else strip(p)
        print('%-22s %s' % (t, r))


if __name__ == '__main__':
    main()
