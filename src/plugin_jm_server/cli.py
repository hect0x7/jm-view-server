"""
命令行入口

让用户无需编写 Python 代码即可启动服务器，例如：

    jms ~/comics --password 123 --port 8080

等价于：

    from plugin_jm_server import JmServer
    JmServer('~/comics', '123').run(host='0.0.0.0', port=8080)

也支持 `python -m plugin_jm_server ...`（见 __main__.py）。
"""
import argparse

from . import __version__
from .app import JmServer

EPILOG = """\
示例:
  jms                                # 共享当前目录, 端口 80, 免密登录
  jms ~/comics -p 8080               # 共享 ~/comics, 端口 8080
  jms ~/comics -P 123 -s             # 设置密码并启用 HTTPS(自签名)
  jms ~/comics -o op.yml             # 加载 jmcomic 配置, 开启在线下载
  jms D:/ --ip-whitelist 192.168.1.10,192.168.1.11

启动后用浏览器访问提示的局域网地址即可(手机与电脑需在同一局域网)。
"""


def build_parser():
    """构造 argparse 解析器。单独抽出便于测试。"""
    parser = argparse.ArgumentParser(
        prog='jms',
        description='“离线版”禁漫天堂：在本地启动文件服务器，用浏览器以禁漫章节模式查看图片。',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=EPILOG,
    )
    parser.add_argument('path', nargs='?', default='.',
                        help='要共享的根目录(默认: 当前目录)')
    parser.add_argument('-P', '--password', default='',
                        help='登录密码(默认: 空, 即免密登录)')
    parser.add_argument('-H', '--host', default='0.0.0.0',
                        help='监听地址(默认: 0.0.0.0, 局域网可访问)')
    parser.add_argument('-p', '--port', type=int, default=JmServer.DEFAULT_PORT,
                        help='监听端口(默认: %(default)s)')
    parser.add_argument('-s', '--ssl', action='store_true',
                        help='启用 HTTPS(使用 adhoc 自签名证书, 需安装 cryptography)')
    parser.add_argument('-o', '--option', metavar='OP_YML',
                        help='jmcomic 配置文件路径, 提供后开启在线下载功能')
    parser.add_argument('--ip-whitelist', metavar='IP[,IP...]',
                        help='IP 白名单, 逗号分隔; 不在名单内的请求返回 404')
    parser.add_argument('--current-path', metavar='PATH',
                        help='初始当前路径(默认与共享根目录相同)')
    parser.add_argument('-e', '--env', action='append', metavar='KEY=VALUE',
                        help='设置环境变量, 可重复指定')
    parser.add_argument('--debug', action='store_true',
                        help='开启 Flask debug 模式')
    parser.add_argument('-v', '--version', action='version',
                        version='%(prog)s {}'.format(__version__))
    return parser


def parse_env(env_list):
    """把 ['A=1', 'B=2'] 解析成 {'A': '1', 'B': '2'}。"""
    env = {}
    for item in env_list or []:
        if '=' not in item:
            raise ValueError('--env 格式应为 KEY=VALUE, 收到: {!r}'.format(item))
        k, v = item.split('=', 1)
        env[k] = v
    return env


def parse_ip_whitelist(raw):
    """把 '1.1.1.1, 2.2.2.2' 解析成列表; 为空时返回 None(表示不限制)。"""
    if not raw:
        return None
    return [ip.strip() for ip in raw.split(',') if ip.strip()] or None


def build_server(args):
    """根据解析后的 args 构造 JmServer(不启动)。抽出以便单测。"""
    jm_option = None
    if args.option:
        import jmcomic
        jm_option = jmcomic.create_option(args.option)

    return JmServer(
        args.path,
        args.password,
        jm_option=jm_option,
        ip_whitelist=parse_ip_whitelist(args.ip_whitelist),
        current_path=args.current_path,
        env=parse_env(args.env),
        # 传入 port, 首页据此拼出局域网访问地址 http://IP:PORT
        port=args.port,
    )


def build_run_kwargs(args):
    """把 args 映射为 JmServer.run() / Flask app.run() 的关键字参数。"""
    kwargs = {'host': args.host, 'port': args.port}
    if args.ssl:
        kwargs['ssl_context'] = 'adhoc'
    if args.debug:
        kwargs['debug'] = True
    return kwargs


def print_banner(args):
    from .driver import get_lan_ip
    scheme = 'https' if args.ssl else 'http'
    lan_ip = get_lan_ip()
    print('=' * 48)
    print('plugin-jm-server v{} 已启动'.format(__version__))
    print('共享目录 : {}'.format(args.path))
    print('本机访问 : {}://127.0.0.1:{}'.format(scheme, args.port))
    if args.host == '0.0.0.0':
        print('局域网访问: {}://{}:{}'.format(scheme, lan_ip, args.port))
    if not args.password:
        print('提示     : 未设置密码, 任何人都能访问, 建议用 -P 设置密码')
    print('按 Ctrl+C 停止服务')
    print('=' * 48)


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        server = build_server(args)
    except Exception as e:  # 配置/参数错误, 以非 0 退出并给出清晰提示
        parser.error(str(e))
        return  # parser.error 已 exit, 此行仅为静态分析

    run_kwargs = build_run_kwargs(args)
    print_banner(args)

    try:
        server.run(**run_kwargs)
    except PermissionError:
        parser.exit(1, '\n端口 {} 需要管理员权限。请改用高位端口, 例如: jms {} -p 8080\n'
                    .format(args.port, args.path))
    except OSError as e:
        parser.exit(1, '\n启动失败(端口 {} 可能已被占用): {}\n请换一个端口, 例如 -p 8080\n'
                    .format(args.port, e))
    except KeyboardInterrupt:
        print('\n已停止。')


if __name__ == '__main__':
    main()
