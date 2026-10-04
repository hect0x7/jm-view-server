"""Decode Shell Link location strings without pylnk3's fixed ANSI charset."""

import os
import struct


def read_link_info_path(path):
    """Prefer Unicode LinkInfo fields; legacy ANSI uses the Windows code page."""
    try:
        with open(path, 'rb') as stream:
            header = stream.read(76)
            if len(header) != 76 or struct.unpack_from('<I', header)[0] != 76:
                return None
            flags = struct.unpack_from('<I', header, 20)[0]
            if flags & 1:
                length = stream.read(2)
                if len(length) != 2:
                    return None
                stream.seek(struct.unpack('<H', length)[0], 1)
            if not flags & 2:
                return None
            size_bytes = stream.read(4)
            if len(size_bytes) != 4:
                return None
            size = struct.unpack('<I', size_bytes)[0]
            if not 28 <= size <= 1024 * 1024:
                return None
            data = size_bytes + stream.read(size - 4)
        if len(data) != size:
            return None

        def number(offset):
            return struct.unpack_from('<I', data, offset)[0]

        def string(offset, unicode=False, limit=None):
            end = len(data) if limit is None else limit
            if not 0 < offset < end <= len(data):
                return ''
            step = 2 if unicode else 1
            cursor = offset
            while cursor + step <= end:
                if data[cursor:cursor + step] == b'\0' * step:
                    encoding = 'utf-16-le' if unicode else ('mbcs' if os.name == 'nt' else 'cp1252')
                    return data[offset:cursor].decode(encoding)
                cursor += step
            return ''

        header_size = number(4)
        if not 28 <= header_size <= size:
            return None
        local_unicode = number(28) if header_size >= 36 else 0
        suffix_unicode = number(32) if header_size >= 36 else 0
        suffix = string(suffix_unicode, True) or string(number(24))
        if number(8) & 1:
            base = string(local_unicode, True) or string(number(16))
        elif number(8) & 2:
            network = number(20)
            if network < header_size or network + 20 > size:
                return None
            network_end = network + number(network)
            name_offset = number(network + 8)
            unicode_offset = number(network + 20) if name_offset > 20 and network + 28 <= network_end <= size else 0
            base = string(network + unicode_offset, True, network_end) if unicode_offset else ''
            base = base or string(network + name_offset, limit=network_end)
        else:
            return None
        if not base:
            return None
        # Some local links already include the common suffix in their base path.
        if suffix and not base.replace('/', '\\').endswith(suffix.replace('/', '\\')):
            return base.rstrip('\\/') + '\\' + suffix.lstrip('\\/')
        return base
    except (OSError, ValueError, LookupError, struct.error):
        return None
