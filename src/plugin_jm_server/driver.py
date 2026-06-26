import os
import re


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
    通过本地接口获取局域网 IP 地址（无需外部连接）
    优先使用 psutil 扫描活动网卡
    """
    import socket
    try:
        import psutil
        
        # 获取所有网卡信息
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        
        # 定义私有地址段前缀
        private_prefixes = ('192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
                            '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
                            '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.')

        # 1. 优先寻找处于 up 状态且有私有 IP 的物理网卡
        fallback_ip = None
        for interface, snics in addrs.items():
            # 跳过禁用的网卡
            if interface in stats and not stats[interface].isup:
                continue
            
            for snic in snics:
                # 必须是 IPv4
                if snic.family == socket.AF_INET:
                    ip = snic.address
                    if not ip.startswith('127.'):
                        if fallback_ip is None:
                            fallback_ip = ip
                        # 排除回环地址，且必须符合私有地址段
                        if any(ip.startswith(prefix) for prefix in private_prefixes):
                            return ip

        if fallback_ip:
            return fallback_ip

        # 2. 如果没找到私有地址，尝试获取主机名的 IP
        host_ip = socket.gethostbyname(socket.gethostname())
        if not host_ip.startswith('127.'):
            return host_ip
            
    except Exception:
        # 最后的保底兜底逻辑
        try:
            return socket.gethostbyname(socket.gethostname())
        except:
            pass
            
    return '127.0.0.1'


if __name__ == "__main__":
    paths = get_winDriver()
    print(paths)
