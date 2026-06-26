"""
CLI 单元测试。

只测试参数解析与到 JmServer 的映射, 不真正启动服务器(不绑定端口)。
运行: python -m pytest tests/ -q   或   python tests/test_cli.py
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from plugin_jm_server import cli  # noqa: E402
from plugin_jm_server.app import JmServer  # noqa: E402


def parse(argv):
    return cli.build_parser().parse_args(argv)


# ---------- 默认值 ----------

def test_defaults():
    args = parse([])
    assert args.path == '.'
    assert args.password == ''
    assert args.host == '0.0.0.0'
    assert args.port == JmServer.DEFAULT_PORT
    assert args.ssl is False
    assert args.option is None
    assert args.ip_whitelist is None
    assert args.current_path is None
    assert args.env is None
    assert args.debug is False


def test_positional_path_and_short_flags():
    args = parse(['/data/comics', '-P', 'pw', '-p', '8080', '-H', '127.0.0.1', '-s'])
    assert args.path == '/data/comics'
    assert args.password == 'pw'
    assert args.port == 8080
    assert args.host == '127.0.0.1'
    assert args.ssl is True


# ---------- env 解析 ----------

def test_parse_env_ok():
    assert cli.parse_env(['A=1', 'B=x=y']) == {'A': '1', 'B': 'x=y'}


def test_parse_env_none():
    assert cli.parse_env(None) == {}


def test_parse_env_bad_raises():
    with pytest.raises(ValueError):
        cli.parse_env(['NOEQUALS'])


# ---------- ip 白名单解析 ----------

def test_parse_ip_whitelist():
    assert cli.parse_ip_whitelist('1.1.1.1, 2.2.2.2 ,') == ['1.1.1.1', '2.2.2.2']
    assert cli.parse_ip_whitelist('') is None
    assert cli.parse_ip_whitelist(None) is None


# ---------- run kwargs 映射 ----------

def test_run_kwargs_plain():
    args = parse(['x', '-p', '8080', '-H', '0.0.0.0'])
    assert cli.build_run_kwargs(args) == {'host': '0.0.0.0', 'port': 8080}


def test_run_kwargs_ssl_and_debug():
    args = parse(['x', '-s', '--debug'])
    kw = cli.build_run_kwargs(args)
    assert kw['ssl_context'] == 'adhoc'
    assert kw['debug'] is True


# ---------- 构造 JmServer(不启动) ----------

def test_build_server_basic():
    args = parse(['/tmp', '-P', 'secret', '-p', '8080'])
    server = cli.build_server(args)
    assert isinstance(server, JmServer)
    assert server.password == 'secret'
    assert server.file_manager.default_path == '/tmp'
    # port 进入 extra, 供首页拼接局域网地址
    assert server.extra.get('port') == 8080
    assert server.ip_whitelist is None


def test_build_server_with_whitelist():
    args = parse(['/tmp', '--ip-whitelist', '10.0.0.1,10.0.0.2'])
    server = cli.build_server(args)
    assert server.ip_whitelist == ['10.0.0.1', '10.0.0.2']


if __name__ == '__main__':
    sys.exit(pytest.main([__file__, '-q']))
