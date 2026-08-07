"""设置中心外观功能的 Playwright 端到端验收。"""
import glob
import os
import tempfile
from pathlib import Path

from PIL import Image


_test_bg_dir = None


def _bg_glob():
    if _test_bg_dir:
        return os.path.join(_test_bg_dir, 'background.*')
    return os.path.join(os.path.expanduser('~'), '.jm_view_server', 'background.*')


def _clean_bg():
    for path in glob.glob(_bg_glob()):
        try:
            os.remove(path)
        except OSError:
            pass


def setup_function(_):
    _clean_bg()


def teardown_function(_):
    _clean_bg()


def _png_path():
    fd, path = tempfile.mkstemp(suffix='.png', prefix='jmv_appearance_bg_')
    os.close(fd)
    Image.new('RGB', (60, 40), (20, 40, 80)).save(path)
    return path


def _open_settings(live_server, browser):
    page = browser.new_page()
    page.goto(live_server.url + '/')
    page.evaluate("localStorage.setItem('jmv-onboarding-settings-v1', '1')")
    page.goto(live_server.url + '/settings')
    page.wait_for_selector('#appearance')
    return page


def _brand(page):
    return page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()")


def test_settings_mobile_uses_single_scroll_container(live_server, browser):
    """窄屏设置页只允许内容区滚动，滚到底后不得继续滚入页面外黑色空白。"""
    css = (Path(__file__).parents[1] / 'src/jm_view_server/static/css/app.css').read_text(encoding='utf-8')
    assert 'height: 100dvh' in css
    assert 'grid-template-rows: 100dvh' in css

    page = _open_settings(live_server, browser)
    page.set_viewport_size({'width': 806, 'height': 865})
    page.reload()
    page.wait_for_selector('#shortcuts')

    metrics = page.evaluate(
        """async () => {
          const root = document.documentElement;
          const host = document.querySelector('.settings-content');
          host.scrollTop = host.scrollHeight;
          await new Promise(resolve => requestAnimationFrame(resolve));
          return {
            rootOverflow: getComputedStyle(root).overflowY,
            bodyOverflow: getComputedStyle(document.body).overflowY,
            hostOverscroll: getComputedStyle(host).overscrollBehaviorY,
            hostScrollTop: host.scrollTop,
            hostMaxScroll: host.scrollHeight - host.clientHeight,
            documentScrollTop: document.scrollingElement.scrollTop,
            viewportWidth: window.innerWidth,
            documentWidth: root.clientWidth
          };
        }""")

    assert metrics['rootOverflow'] == 'hidden'
    assert metrics['bodyOverflow'] == 'hidden'
    assert metrics['hostOverscroll'] == 'contain'
    assert metrics['hostMaxScroll'] > 0
    assert abs(metrics['hostScrollTop'] - metrics['hostMaxScroll']) <= 1
    assert metrics['documentScrollTop'] == 0
    assert metrics['documentWidth'] == metrics['viewportWidth']

    host_box = page.locator('.settings-content').bounding_box()
    page.mouse.move(host_box['x'] + host_box['width'] / 2,
                    host_box['y'] + host_box['height'] / 2)
    page.mouse.wheel(0, 1400)
    page.evaluate(
        """() => {
          const host = document.querySelector('.settings-content');
          host.tabIndex = -1;
          host.focus({preventScroll: true});
        }""")
    page.keyboard.press('PageDown')
    page.keyboard.press('End')
    page.wait_for_timeout(180)
    after_extra_scroll = page.evaluate(
        """() => {
          const host = document.querySelector('.settings-content');
          const app = document.querySelector('.app').getBoundingClientRect();
          return {
            hostScrollTop: host.scrollTop,
            hostMaxScroll: host.scrollHeight - host.clientHeight,
            documentScrollTop: document.scrollingElement.scrollTop,
            appTop: app.top,
            appBottom: app.bottom,
            viewportHeight: window.innerHeight
          };
        }""")
    assert abs(after_extra_scroll['hostScrollTop'] - after_extra_scroll['hostMaxScroll']) <= 1
    assert after_extra_scroll['documentScrollTop'] == 0
    assert abs(after_extra_scroll['appTop']) <= 1
    assert after_extra_scroll['appBottom'] >= after_extra_scroll['viewportHeight'] - 1


def test_settings_rail_navigation_never_scrolls_document(live_server, browser):
    """桌面设置菜单只滚动内容区，所有分类均不得把 App Shell 推出视口。"""
    page = _open_settings(live_server, browser)
    page.set_viewport_size({'width': 1280, 'height': 720})
    page.reload()
    page.wait_for_selector('.settings-rail')

    for href in ('#appearance', '#browser', '#reader', '#message', '#shortcuts', '#data'):
        page.locator(f'.settings-rail a[href="{href}"]').click()
        metrics = page.evaluate(
            """async hash => {
              await new Promise(resolve => requestAnimationFrame(resolve));
              await new Promise(resolve => requestAnimationFrame(resolve));
              await new Promise(resolve => setTimeout(resolve, 140));
              const app = document.querySelector('.app').getBoundingClientRect();
              const host = document.querySelector('.settings-content').getBoundingClientRect();
              const target = document.querySelector(hash).getBoundingClientRect();
              return {
                documentTop: document.scrollingElement.scrollTop,
                appTop: app.top,
                appBottom: app.bottom,
                viewportHeight: window.innerHeight,
                targetVisible: target.bottom > host.top && target.top < host.bottom,
                active: document.querySelector('.settings-rail a[aria-current="location"]')?.getAttribute('href'),
                hash: window.location.hash
              };
            }""",
            href)
        assert metrics['documentTop'] == 0, href
        assert abs(metrics['appTop']) <= 1, href
        assert metrics['appBottom'] >= metrics['viewportHeight'] - 1, href
        assert metrics['targetVisible'] is True, href
        assert metrics['active'] == href
        assert metrics['hash'] == href


def test_settings_hash_navigation_and_history_never_scroll_document(live_server, browser):
    """直接 hash、hashchange 和历史返回均由内容滚动区接管。"""
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    page.goto(live_server.url + '/settings#shortcuts')
    page.wait_for_selector('#shortcuts')
    page.wait_for_timeout(180)

    def assert_hash_stable(expected_hash):
        metrics = page.evaluate(
            """hash => {
              const app = document.querySelector('.app').getBoundingClientRect();
              const host = document.querySelector('.settings-content').getBoundingClientRect();
              const target = document.querySelector(hash).getBoundingClientRect();
              return {
                documentTop: document.scrollingElement.scrollTop,
                appTop: app.top,
                appBottom: app.bottom,
                viewportHeight: window.innerHeight,
                targetVisible: target.bottom > host.top && target.top < host.bottom,
                hash: location.hash
              };
            }""",
            expected_hash)
        assert metrics['documentTop'] == 0
        assert abs(metrics['appTop']) <= 1
        assert metrics['appBottom'] >= metrics['viewportHeight'] - 1
        assert metrics['targetVisible'] is True
        assert metrics['hash'] == expected_hash

    assert_hash_stable('#shortcuts')
    page.evaluate("location.hash = '#data'")
    page.wait_for_timeout(180)
    assert_hash_stable('#data')
    page.go_back()
    page.wait_for_timeout(180)
    assert_hash_stable('#shortcuts')

    for viewport in ({'width': 860, 'height': 500}, {'width': 861, 'height': 500}):
        page.set_viewport_size(viewport)
        page.wait_for_timeout(220)
        assert_hash_stable('#shortcuts')


def _assert_settings_mutation_stable(page, selector, action, label_selector=None):
    samples = page.evaluate(
        """async ({selector, action, labelSelector}) => {
          const host = document.querySelector('.settings-content');
          const main = document.querySelector('.settings-main');
          let topSpacer = document.getElementById('settings-stability-spacer');
          if (!topSpacer) {
            topSpacer = document.createElement('div');
            topSpacer.id = 'settings-stability-spacer';
            topSpacer.style.height = '720px';
            topSpacer.style.flex = '0 0 720px';
            main.prepend(topSpacer);
          }
          const target = document.querySelector(selector);
          const hostRect = host.getBoundingClientRect();
          host.scrollTop += target.getBoundingClientRect().top
            - hostRect.top - host.clientHeight * 0.45;
          const stable = target.closest('.settings-card, .settings-data-card')
            || Array.from(document.querySelectorAll('.settings-card')).find(card => {
              const rect = card.getBoundingClientRect();
              return rect.bottom > hostRect.top && rect.top < hostRect.bottom;
            }) || main;
          const snapshot = () => ({
            scrollTop: host.scrollTop,
            targetTop: target.getBoundingClientRect().top,
            targetInHost: host.contains(target),
            stableTop: stable.getBoundingClientRect().top,
            hostWidth: host.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth
          });
          const before = snapshot();
          if (labelSelector) {
            document.querySelector(labelSelector).dispatchEvent(
              new PointerEvent('pointerdown', {bubbles: true}));
          }
          setTimeout(() => {
            stable.style.paddingRight = '1px';
            setTimeout(() => stable.style.removeProperty('padding-right'), 70);
          }, 30);
          if (action === 'click') target.click();
          if (action === 'checkbox') target.click();
          if (action === 'double-range') {
            target.value = '83';
            target.dispatchEvent(new Event('input', {bubbles: true}));
            target.dispatchEvent(new Event('change', {bubbles: true}));
          }
          if (action === 'image-range') {
            target.value = '1050';
            target.dispatchEvent(new Event('input', {bubbles: true}));
            target.dispatchEvent(new Event('change', {bubbles: true}));
          }
          if (action === 'theme') {
            target.value = target.value === 'dark' ? 'light' : 'dark';
            target.dispatchEvent(new Event('change', {bubbles: true}));
          }
          const immediate = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const firstFrame = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const secondFrame = snapshot();
          await new Promise(resolve => setTimeout(resolve, 100));
          const after100ms = snapshot();
          await new Promise(resolve => setTimeout(resolve, 120));
          const deferred = snapshot();
          await new Promise(resolve => setTimeout(resolve, 600));
          return {
            before, immediate, firstFrame, secondFrame, after100ms, deferred,
            cleanedUp: !host.classList.contains('settings-preserve-scroll')
          };
        }""",
        {'selector': selector, 'action': action, 'labelSelector': label_selector})

    before = samples.pop('before')
    assert samples.pop('cleanedUp') is True
    assert before['scrollTop'] > 100
    for phase, sample in samples.items():
        assert abs(sample['scrollTop'] - before['scrollTop']) <= 2, (selector, phase, before, sample)
        if before['targetInHost']:
            assert abs(sample['targetTop'] - before['targetTop']) <= 2, (selector, phase, before, sample)
        assert abs(sample['stableTop'] - before['stableTop']) <= 2, (selector, phase, before, sample)
        if before['targetInHost']:
            assert sample['hostWidth'] == before['hostWidth']
        assert sample['documentWidth'] == sample['viewportWidth']


def test_settings_page_replaces_appearance_modal(live_server, browser):
    page = _open_settings(live_server, browser)
    assert page.title() == '设置 · jm-view-server'
    assert page.locator('.settings-section').count() == 6
    assert page.locator('#shortcutGrid kbd').count() > 0
    assert page.locator('.nav-item[href="/settings"]').count() == 1
    body = page.locator('#appearance').inner_text()
    assert '主题色' in body and '背景图片' in body and '背景淡化' in body


def test_reader_modes_and_direction_persist(live_server, browser):
    page = _open_settings(live_server, browser)
    mode_buttons = page.locator('#readerModeSegment [data-value]')
    assert mode_buttons.count() == 3
    assert mode_buttons.evaluate_all(
        "buttons => buttons.map(button => button.dataset.value)") == [
            'scroll', 'single', 'double']

    page.click('#readerModeSegment [data-value="double"]')
    page.click('#readingDirectionSegment [data-value="rtl"]')
    assert page.evaluate("localStorage.getItem('jmv-reader-mode')") == 'double'
    assert page.evaluate("localStorage.getItem('jmv-reading-direction')") == 'rtl'

    page.reload()
    page.wait_for_selector('#readingDirectionSegment')
    assert page.locator(
        '#readerModeSegment [data-value="double"].active').count() == 1
    assert page.locator(
        '#readingDirectionSegment [data-value="rtl"].active').count() == 1


def test_double_width_scale_full_width_persists(live_server, browser):
    page = _open_settings(live_server, browser)
    page.eval_on_selector(
        '#doubleWidthScale',
        "el => { el.value = '100'; el.dispatchEvent(new Event('input', {bubbles:true})); }")

    assert page.evaluate("localStorage.getItem('jmv-double-width-scale')") == '100'
    assert page.inner_text('#doubleWidthScaleValue') == '100%'

    page.reload()
    page.wait_for_selector('#doubleWidthScale')
    assert page.input_value('#doubleWidthScale') == '100'
    assert page.inner_text('#doubleWidthScaleValue') == '100%'


def test_settings_mutations_preserve_scroll_and_control_anchor(live_server, browser):
    page = _open_settings(live_server, browser)
    cases = [
        ('#browserViewSegment [data-value="grid"]', 'click'),
        ('#eyeCare', 'click'),
        ('#headerVisible', 'click'),
        ('#progressVisible', 'click'),
        ('#autoNext', 'click'),
        ('#doubleWidthScale', 'double-range'),
        ('#imageSize', 'image-range'),
        ('#themeSelect', 'theme'),
        ('#sidebarCollapsed', 'click'),
        ('#browserOperations', 'click'),
        ('.sidebar button[onclick*="toggleSidebarCollapse"]', 'click'),
    ]
    for selector, action in cases:
        page.reload()
        page.wait_for_selector('#appearance')
        _assert_settings_mutation_stable(page, selector, action)

    page.click('#sidebarCollapsed')
    page.wait_for_selector('#toastHost')
    assert '刷新页面后生效' in page.inner_text('#toastHost')


def test_browser_operations_setting_persists(live_server, browser):
    page = _open_settings(live_server, browser)
    operation_switch = page.locator('#browserOperations')
    assert operation_switch.get_attribute('aria-checked') == 'true'

    page.evaluate("JmvPrefs.set('browserOperations', false)")
    assert operation_switch.get_attribute('aria-checked') == 'false'
    page.evaluate("window.dispatchEvent(new StorageEvent('storage', {key: 'jmv-browser-operations', newValue: '1'}))")
    assert operation_switch.get_attribute('aria-checked') == 'true'
    page.evaluate("window.dispatchEvent(new StorageEvent('storage', {key: 'jmv-browser-operations', newValue: null}))")
    assert operation_switch.get_attribute('aria-checked') == 'true'

    operation_switch.click()
    assert operation_switch.get_attribute('aria-checked') == 'false'
    assert page.evaluate("localStorage.getItem('jmv-browser-operations')") == '0'

    page.reload()
    page.wait_for_selector('#browserOperations')
    assert page.locator('#browserOperations').get_attribute('aria-checked') == 'false'


def test_settings_labels_keep_focusable_controls_stable(live_server, browser):
    page = _open_settings(live_server, browser)
    labels = [
        ('#doubleWidthScaleControl', '#doubleWidthScale', 'double-range'),
        ('label[for="imageSize"]', '#imageSize', 'image-range'),
        ('label[for="themeSelect"]', '#themeSelect', 'theme'),
    ]
    for label_selector, control_selector, action in labels:
        page.reload()
        page.wait_for_selector('#appearance')
        _assert_settings_mutation_stable(
            page, control_selector, action, label_selector=label_selector)
        assert page.evaluate(
            "selector => document.activeElement === document.querySelector(selector)",
            control_selector)


def test_reader_switches_never_jump_and_persist(live_server, browser):
    """阅读开关在桌面/移动端以鼠标和键盘操作时保持内容锚点，并持久化状态。"""
    page = _open_settings(live_server, browser)
    selectors = ('#eyeCare', '#headerVisible', '#progressVisible', '#autoNext')
    operations = ('click', 'Enter', 'Space')

    for viewport in ({'width': 1280, 'height': 720}, {'width': 390, 'height': 844}):
        page.set_viewport_size(viewport)
        for selector in selectors:
            for operation in operations:
                page.reload()
                page.wait_for_selector(selector)
                page.evaluate(
                    """selector => {
                      const host = document.querySelector('.settings-content');
                      const control = document.querySelector(selector);
                      host.scrollTop += control.getBoundingClientRect().top
                        - host.getBoundingClientRect().top - host.clientHeight * 0.45;
                      control.focus({preventScroll: true});
                    }""",
                    selector)
                before = page.evaluate(
                    """selector => {
                      const host = document.querySelector('.settings-content');
                      const control = document.querySelector(selector);
                      const card = control.closest('.settings-card');
                      return {
                        scrollTop: host.scrollTop,
                        controlTop: control.getBoundingClientRect().top,
                        cardTop: card.getBoundingClientRect().top,
                        documentTop: document.scrollingElement.scrollTop,
                        checked: control.getAttribute('aria-checked')
                      };
                    }""",
                    selector)

                if operation == 'click':
                    page.locator(selector).click()
                else:
                    page.locator(selector).press(operation)
                page.wait_for_timeout(500)

                after = page.evaluate(
                    """selector => {
                      const host = document.querySelector('.settings-content');
                      const control = document.querySelector(selector);
                      const card = control.closest('.settings-card');
                      return {
                        scrollTop: host.scrollTop,
                        controlTop: control.getBoundingClientRect().top,
                        cardTop: card.getBoundingClientRect().top,
                        documentTop: document.scrollingElement.scrollTop,
                        checked: control.getAttribute('aria-checked')
                      };
                    }""",
                    selector)

                assert before['scrollTop'] > 100, (viewport, selector, operation)
                assert after['documentTop'] == 0, (viewport, selector, operation, before, after)
                assert abs(after['scrollTop'] - before['scrollTop']) <= 2, (viewport, selector, operation, before, after)
                assert abs(after['controlTop'] - before['controlTop']) <= 2, (viewport, selector, operation, before, after)
                assert abs(after['cardTop'] - before['cardTop']) <= 2, (viewport, selector, operation, before, after)
                assert after['checked'] != before['checked'], (viewport, selector, operation)

                page.reload()
                page.wait_for_selector(selector)
                assert page.locator(selector).get_attribute('aria-checked') == after['checked']


def test_rapid_settings_interactions_cancel_previous_anchor(live_server, browser):
    page = _open_settings(live_server, browser)
    samples = page.evaluate(
        """async () => {
          const host = document.querySelector('.settings-content');
          const main = document.querySelector('.settings-main');
          const spacer = document.createElement('div');
          spacer.style.height = '720px';
          spacer.style.flex = '0 0 720px';
          main.prepend(spacer);
          const imageSize = document.querySelector('#imageSize');
          const eyeCare = document.querySelector('#eyeCare');
          const eyeCard = eyeCare.closest('.settings-card');
          const hostRect = host.getBoundingClientRect();
          host.scrollTop += imageSize.getBoundingClientRect().top
            - hostRect.top - host.clientHeight * 0.4;
          ['950', '1000', '1050'].forEach(value => {
            imageSize.value = value;
            imageSize.dispatchEvent(new Event('input', {bubbles: true}));
          });
          imageSize.dispatchEvent(new Event('change', {bubbles: true}));
          host.scrollTop -= 100;
          const snapshot = () => ({
            scrollTop: host.scrollTop,
            controlTop: eyeCare.getBoundingClientRect().top,
            cardTop: eyeCard.getBoundingClientRect().top,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth
          });
          const before = snapshot();
          eyeCare.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
          eyeCare.click();
          const immediate = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const firstFrame = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const secondFrame = snapshot();
          await new Promise(resolve => setTimeout(resolve, 100));
          const after100ms = snapshot();
          return {before, immediate, firstFrame, secondFrame, after100ms};
        }""")

    before = samples.pop('before')
    assert before['scrollTop'] > 100
    for sample in samples.values():
        assert abs(sample['scrollTop'] - before['scrollTop']) <= 2
        assert abs(sample['controlTop'] - before['controlTop']) <= 2
        assert abs(sample['cardTop'] - before['cardTop']) <= 2
        assert sample['documentWidth'] == sample['viewportWidth']


def test_user_scroll_discards_stale_settings_interaction_anchor(live_server, browser):
    page = _open_settings(live_server, browser)
    samples = page.evaluate(
        """async () => {
          const host = document.querySelector('.settings-content');
          const main = document.querySelector('.settings-main');
          const spacer = document.createElement('div');
          spacer.style.height = '720px';
          spacer.style.flex = '0 0 720px';
          main.prepend(spacer);
          const target = document.querySelector('#themeSelect');
          const card = target.closest('.settings-card');
          const hostRect = host.getBoundingClientRect();
          host.scrollTop += target.getBoundingClientRect().top
            - hostRect.top - host.clientHeight * 0.4;
          target.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
          host.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: 120}));
          host.scrollTop += 120;
          const snapshot = () => ({
            scrollTop: host.scrollTop,
            controlTop: target.getBoundingClientRect().top,
            cardTop: card.getBoundingClientRect().top
          });
          const before = snapshot();
          target.value = target.value === 'dark' ? 'light' : 'dark';
          target.dispatchEvent(new Event('change', {bubbles: true}));
          const immediate = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const firstFrame = snapshot();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const secondFrame = snapshot();
          await new Promise(resolve => setTimeout(resolve, 100));
          const after100ms = snapshot();
          return {before, immediate, firstFrame, secondFrame, after100ms};
        }""")

    before = samples.pop('before')
    for sample in samples.values():
        assert abs(sample['scrollTop'] - before['scrollTop']) <= 2
        assert abs(sample['controlTop'] - before['controlTop']) <= 2
        assert abs(sample['cardTop'] - before['cardTop']) <= 2


def test_brand_color_swatch_and_persist(live_server, browser):
    page = _open_settings(live_server, browser)
    page.click('#brandSwatches [data-color="#e5484d"]')
    assert _brand(page) == '#e5484d'
    assert page.evaluate("localStorage.getItem('jmv-brand')") == '#e5484d'

    page.reload()
    page.wait_for_selector('#appearance')
    assert _brand(page) == '#e5484d'


def test_brand_color_picker_input(live_server, browser):
    page = _open_settings(live_server, browser)
    page.eval_on_selector(
        '#brandPicker',
        "el => { el.value = '#12a150'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert _brand(page) == '#12a150'
    assert page.evaluate("localStorage.getItem('jmv-brand')") == '#12a150'


def test_brand_reset_default(live_server, browser):
    page = _open_settings(live_server, browser)
    page.click('#brandSwatches [data-color="#e5484d"]')
    assert _brand(page) == '#e5484d'

    page.click('#brandReset')
    assert _brand(page) == '#5b5bd6'
    assert page.evaluate("localStorage.getItem('jmv-brand')") in (None, '')


def test_background_upload_and_opacity(live_server, browser):
    page = _open_settings(live_server, browser)
    image_path = _png_path()
    try:
        page.set_input_files('#backgroundFile', image_path)
        page.wait_for_function(
            "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    finally:
        os.remove(image_path)

    assert '/api/background' in page.eval_on_selector(
        'body', "e => getComputedStyle(e).backgroundImage")
    assert page.evaluate("localStorage.getItem('jmv-bg')").startswith('/api/background')

    page.eval_on_selector(
        '#backgroundOpacity',
        "el => { el.value = '70'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert abs(float(page.eval_on_selector('#appBgMask', 'e => e.style.opacity')) - 0.7) < 1e-6
    assert page.evaluate("localStorage.getItem('jmv-bg-opacity')") == '70'

    page.reload()
    page.wait_for_selector('#appearance')
    assert '/api/background' in page.eval_on_selector(
        'body', "e => getComputedStyle(e).backgroundImage")
    assert abs(float(page.eval_on_selector('#appBgMask', 'e => e.style.opacity')) - 0.7) < 1e-6


def test_clear_background(live_server, browser):
    page = _open_settings(live_server, browser)
    image_path = _png_path()
    try:
        page.set_input_files('#backgroundFile', image_path)
        page.wait_for_function(
            "() => getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    finally:
        os.remove(image_path)

    page.click('#backgroundClear')
    page.wait_for_function(
        "() => !getComputedStyle(document.body).backgroundImage.includes('/api/background')")
    assert page.evaluate("localStorage.getItem('jmv-bg')") in (None, '')
    assert page.eval_on_selector('#appBgMask', 'e => e.style.opacity') == '0'
