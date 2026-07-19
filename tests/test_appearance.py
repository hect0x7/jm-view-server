"""设置中心外观功能的 Playwright 端到端验收。"""
import glob
import os
import tempfile

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
            });
          const snapshot = () => ({
            scrollTop: host.scrollTop,
            targetTop: target.getBoundingClientRect().top,
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
    for sample in samples.values():
        assert abs(sample['scrollTop'] - before['scrollTop']) <= 2
        assert abs(sample['targetTop'] - before['targetTop']) <= 2
        assert abs(sample['stableTop'] - before['stableTop']) <= 2
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
        ('#eyeCare', 'checkbox'),
        ('#doubleWidthScale', 'double-range'),
        ('#imageSize', 'image-range'),
        ('#themeSelect', 'theme'),
        ('#sidebarCollapsed', 'click'),
        ('.sidebar button[onclick*="toggleSidebarCollapse"]', 'click'),
    ]
    for selector, action in cases:
        page.reload()
        page.wait_for_selector('#appearance')
        _assert_settings_mutation_stable(page, selector, action)

    page.click('#sidebarCollapsed')
    page.wait_for_selector('#toastHost')
    assert '刷新页面后生效' in page.inner_text('#toastHost')


def test_settings_labels_keep_focusable_controls_stable(live_server, browser):
    page = _open_settings(live_server, browser)
    labels = [
        ('#doubleWidthScaleControl', '#doubleWidthScale', 'double-range'),
        ('label[for="imageSize"]', '#imageSize', 'image-range'),
        ('label[for="themeSelect"]', '#themeSelect', 'theme'),
        ('.settings-switch-row:has(#eyeCare)', '#eyeCare', 'checkbox'),
    ]
    for label_selector, control_selector, action in labels:
        page.reload()
        page.wait_for_selector('#appearance')
        _assert_settings_mutation_stable(
            page, control_selector, action, label_selector=label_selector)
        assert page.evaluate(
            "selector => document.activeElement === document.querySelector(selector)",
            control_selector)


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
