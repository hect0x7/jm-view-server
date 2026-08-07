import re
import os
import sys


def add_output(k, v):
    output_path = os.environ.get('GITHUB_OUTPUT')
    if not output_path:
        print(f'{k}={v}')
        return

    with open(output_path, 'a', encoding='utf-8') as f:
        f.write(f'{k}={v}\n')


def parse_body(body):
    if ';' not in body:
        return body

    parts = body.split(";")
    points = []
    for i, e in enumerate(parts):
        e: str = e.strip()
        if e == '':
            continue
        points.append(f'{i + 1}. {e}')

    return '\n'.join(points)


def get_tag_and_body():
    msg = sys.argv[1]
    print(f'msg: {msg}')
    p = re.compile('(.*?): ?(.*)')
    match = p.search(msg)
    assert match is not None, f'commit message format is wrong: {msg}'
    tag, body = match[1], match[2]
    return body, tag


def changelog_body(tag, path='CHANGELOG.md'):
    if not os.path.exists(path):
        return None

    with open(path, encoding='utf-8') as f:
        content = f.read()

    heading = re.compile(
        rf'^## \[{re.escape(tag)}\](?:\s+-\s+[^\n]+)?\s*$\n(.*?)(?=^##\s|\Z)',
        re.MULTILINE | re.DOTALL,
    )
    match = heading.search(content)
    return match.group(1).strip() if match else None


def main():
    body, tag = get_tag_and_body()

    add_output('tag', tag)

    with open('release_body.txt', 'w', encoding='utf-8') as f:
        f.write(changelog_body(tag) or parse_body(body))


main()
