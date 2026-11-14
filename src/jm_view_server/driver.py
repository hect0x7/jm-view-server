import os
import re
import shutil

_HIGH_PRIORITY_IFACE_PREFIXES = (
    'wlan', 'wl', 'wifi', 'wi-fi', 'en', 'eth', 'ethernet',
    'ap', 'swlan', 'softap', 'rndis', '以太网',
)
_LOW_PRIORITY_IFACE_PREFIXES = (
    'tun', 'tap', 'utun', 'ppp', 'ccmni', 'rmnet', 'clat',
    'wg', 'tailscale', 'docker', 'veth', 'br-', 'virbr', 'lo',
    'vethernet', 'vmnet', 'vboxnet',
)
_PRIVATE_IP_PREFIXES = (
    '192.168.', '10.',
    '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
)
_POSIX_PROBE_IFACES = (
    'wlan0', 'wlan1', 'wlan2', 'ap0', 'swlan0', 'softap0', 'rndis0', 'eth0', 'eth1',
)


def is_android() -> bool:
    """判断当前是否运行在 Android / Termux 环境下。"""
    if os.name == 'nt':
        return False
    if any(os.environ.get(key) for key in ('ANDROID_ROOT', 'ANDROID_DATA', 'TERMUX_VERSION')):
        return True
    return os.path.exists('/system/build.prop')


def get_android_drivers() -> list:
    """
    返回 Android 环境下可读的常用存储根目录列表。
    默认优先内部存储根与用户主目录，并探测挂载的外置存储。
    """
    candidates = ['/storage/emulated/0', os.path.expanduser('~')]
    try:
        for name in sorted(os.listdir('/storage')):
            if name in ('emulated', 'self'):
                continue
            candidates.append(os.path.join('/storage', name))
    except OSError:
        pass

    readable = []
    seen = set()
    for path in candidates:
        if not path or path in seen:
            continue
        seen.add(path)
        try:
            if os.path.isdir(path):
                os.listdir(path)
                readable.append(path)
        except OSError:
            continue

    return readable or ['/']


def android_move_to_trash(path_abs: str, fallback_root: str = None) -> str:
    """
    Android 存储层降级回收站：当 send2trash 因 FUSE 或权限限制失败时，
    将文件或目录移动到共享存储根下的 .jm_trash 目录，并处理同名冲突。
    """
    src_abs = os.path.abspath(path_abs)
    if not os.path.lexists(src_abs):
        raise FileNotFoundError(src_abs)

    norm_posix = src_abs.replace('\\', '/')
    if norm_posix.startswith('/storage/emulated/0/'):
        trash_dir = '/storage/emulated/0/.jm_trash'
    elif fallback_root:
        trash_dir = os.path.join(os.path.abspath(fallback_root), '.jm_trash')
    else:
        trash_dir = os.path.expanduser('~/.jm_view_server/trash')

    real_src = os.path.realpath(src_abs)
    real_trash = os.path.realpath(trash_dir)
    if real_src == real_trash or real_trash.startswith(real_src + os.sep):
        raise OSError('Cannot move trash directory or its ancestor into trash')
    if real_src.startswith(real_trash + os.sep):
        trash_dir = os.path.expanduser('~/.jm_view_server/trash')
        real_trash = os.path.realpath(trash_dir)
        if real_src == real_trash or real_trash.startswith(real_src + os.sep):
            raise OSError('Cannot move trash directory into itself')

    os.makedirs(trash_dir, exist_ok=True)
    base = os.path.basename(src_abs.rstrip('/\\'))
    stem, ext = (base, '') if os.path.isdir(src_abs) else os.path.splitext(base)
    candidate = os.path.join(trash_dir, base)
    index = 1
    while os.path.lexists(candidate):
        candidate = os.path.join(trash_dir, f'{stem} ({index}){ext}')
        index += 1

    return shutil.move(src_abs, candidate)


def _iface_priority(name: str) -> int:
    """按网卡名返回局域网优先级：0=Wi-Fi/有线/热点，1=普通网卡，2=虚拟/蜂窝。"""
    lower = (name or '').strip().lower()
    if lower.startswith(_LOW_PRIORITY_IFACE_PREFIXES):
        return 2
    if lower.startswith(_HIGH_PRIORITY_IFACE_PREFIXES):
        return 0
    return 1


def _is_private_ipv4(ip: str) -> bool:
    """判断是否属于 RFC 1918 私有 IPv4 网段。"""
    return ip.startswith(_PRIVATE_IP_PREFIXES)


def _get_iface_ipv4_ioctl(ifname: str):
    """在 POSIX 系统上直接通过 SIOCGIFADDR ioctl 查询网卡 IPv4（可绕过 Android SELinux 对 netlink 的限制）。"""
    if os.name == 'nt':
        return None
    import socket
    import struct
    try:
        import fcntl
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            ifreq = struct.pack('256s', ifname.encode('utf-8')[:15])
            res = fcntl.ioctl(sock.fileno(), 0x8915, ifreq)
            return socket.inet_ntoa(res[20:24])
    except (OSError, ImportError, ValueError):
        return None


def get_winDriver():
    """
    Windows操作系统下,返回全部驱动器卷标['C:\','D:\']
    """
    import psutil
    # 返回驱动器卷标列表
    driver_list = sorted([driver.device for driver in psutil.disk_partitions(True)])

    i = 0
    num = len(driver_list)
    while num != 0:
        # 重新格式化分隔符
        driver_name = driver_list[i]
        driver_name = driver_name.strip('\\')
        driver_name += '/'

        # 测试各驱动器是否可访问，目的是筛除未就绪驱动器，如空光驱
        try:
            os.listdir(driver_name)
            driver_list[i] = driver_name
            i += 1
        except PermissionError as e:
            del driver_list[i]
            mobj = re.match(r'\[WinError (\d+)\]', str(e))
            # ERROR_NOT_READY, ERROR_ACCESS_DENIED
            if mobj is not None and mobj.group(1) not in {'21', '5'}:
                print(f'Drive {driver_name} unexpectedly unavailable: {e}')
        finally:
            num -= 1

    # 返回列表
    return driver_list


def get_lan_ip():
    """
    通过本地接口获取局域网 IP 地址（无需外部连接）。
    优先选用 Wi-Fi / 有线 / 热点私有 IP；若 Android SELinux 阻止 psutil 访问 netlink，
    回退至 POSIX SIOCGIFADDR ioctl 直接读取常见局域网网卡。
    """
    import socket

    candidates = []
    try:
        import psutil

        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        idx = 0
        for interface, snics in addrs.items():
            if interface in stats and not stats[interface].isup:
                continue
            prio = _iface_priority(interface)
            for snic in snics:
                if snic.family == socket.AF_INET:
                    ip = snic.address
                    if not ip.startswith('127.'):
                        priv_rank = 0 if _is_private_ipv4(ip) else 1
                        candidates.append((prio, priv_rank, idx, ip))
                        idx += 1
    except Exception:
        pass

    candidates.sort()
    if candidates and candidates[0][0] <= 1 and candidates[0][1] == 0:
        return candidates[0][3]

    ioctl_public_fallback = None
    if os.name != 'nt':
        for ifname in _POSIX_PROBE_IFACES:
            ip = _get_iface_ipv4_ioctl(ifname)
            if ip and not ip.startswith('127.'):
                if _is_private_ipv4(ip):
                    return ip
                if ioctl_public_fallback is None:
                    ioctl_public_fallback = ip

    if candidates:
        return candidates[0][3]
    if ioctl_public_fallback:
        return ioctl_public_fallback

    try:
        host_ip = socket.gethostbyname(socket.gethostname())
        if host_ip and not host_ip.startswith('127.'):
            return host_ip
    except Exception:
        pass

    return '127.0.0.1'


if __name__ == "__main__":
    paths = get_winDriver()
    print(paths)
