/*if (parseInt(aid) > parseInt(scramble_id) && speed != true) {
    $('.row.thumb-overlay-albums img').each(function () {
        if ($(this).closest('a').length == 0 && $(this).attr('id').indexOf('gif') < 0) {
            $(this).css({visibility: 'hidden'});
        }
    });
}*/
var speed = 1;

$(document).ready(function () {
    var lazytotal = 0;
    var refresh = true;
    var before_change = 0;


    $("#pageselect").on('focus', function () {
        // Store the current value on focus and on change
        before_change = $(this).val();
    }).on('change', function () {
        refresh = false;
        lazytotal = 0;
        if (readmode === 'read-by-page') {
            owl.trigger('to.owl.carousel', $(this).val())
        } else {
            gototop();
        }
    });

    $('.page-cont.container a').on('click', function () {
        if (readmode === 'read-by-page') {
            owl.trigger('to.owl.carousel', $(this).data('pagecount'))
        } else {
            sp = $(this).text();
            divid = "#page_" + (parseInt(sp) - 1);
            settop = $(divid).offset().top;
            $("html,body").animate({
                scrollTop: settop
            }, 50);
        }
        $('.ph-active.switch.click span').text($(this).text() + '/' + $('#maxpage').html())
    });
    //
    $(window).scroll(function () {
        //adv_resize();
        // refreshpage();
    });

    const images = document.querySelectorAll('.scramble-page');

    //var imgCurrentPage = 1;
    var removing = false;

    function handleIntersection(entries) {
        entries.map((entry) => {
            var canObj = $(entry.target).find('canvas');
            var imgObj = $(entry.target).find('img');
            if (!imgObj.hasClass('lazy-loaded')) {
                return;
            }
            var doc_can = canObj.get(0);
            //let tmp_page = parseInt($(imgObj).parent().attr('id').split('.')[0])
            let tmp_page = parseInt($(imgObj).attr('data-page'));
            $(entry.target).css('min-height', entry.boundingClientRect.height + 'px');
            let remove_range = parseInt(window.innerHeight / entry.boundingClientRect.height) + 4;
            if (entry.isIntersecting) {
                if (canObj.length == 0 && imgObj.attr('src').indexOf('/blank.jpg') < 0) {
                    scramble_image(imgObj[0], aid, scramble_id, false, speed);
                }
                removeOutsideCanvas(tmp_page, remove_range);
                //imgCurrentPage = tmp_page;
            }
        });
    }

    function removeOutsideCanvas(tmp_page, remove_range) {
        if (!removing) {
            removing = true;
            $('.scramble-page').each(function (index) {
                if (index > tmp_page + remove_range || index < tmp_page - remove_range) {
                    let removeCan = $(this).find('canvas')
                    let hideImgObj = $(this).find('img')
                    let removeDocCan = removeCan.get(0)
                    if (removeCan.length > 0) {
                        hideImgObj.removeClass('hide');
                        hideImgObj.css('visibility', 'hidden');
                        removeCan.remove();
                        removeDocCan.width = 0;
                        removeDocCan.height = 0;
                        removeDocCan = null;
                    }
                }
            });
            removing = false;
        }
    }

    //不支援新版lazy
    if (
        !'IntersectionObserver' in window ||
        !'IntersectionObserverEntry' in window ||
        !window.IntersectionObserver ||
        window.IntersectionObserverEntry && !'intersectionRatio' in window.IntersectionObserverEntry.prototype
    ) {

        //var check_current_visible = 0;
        const pagelItem = document.querySelectorAll('.scramble-page');

        $(window).scroll(function () {
            pagelItem.forEach(function (e) {
                var canObj = $(e).find('canvas');
                var imgObj = $(e).find('img');
                var doc_can = canObj.get(0);

                if (!imgObj.get(0).loaded) {
                    return;
                }

                if ($.inviewport(e, {threshold: 500}) == true) {//檢查是否在範圍內
                    scramble_image(imgObj[0], aid, scramble_id, false, speed);
                } else {
                    if (canObj.length > 0) {
                        imgObj.removeClass('hide');
                        canObj.remove();
                        doc_can.width = 0;
                        doc_can.height = 0;
                        doc_can = null;
                    }
                }
            });

            $("img.lazy_img,iframe.lazyload").lazyload_old({
                threshold: 500,
                //rootMargin: 500,
                src: 'data-original',
                load: function () {


                    if ($(this).parent('.scramble-page').length > 0) {
                        $(this).addClass('lazy-loaded');
                        // $(this).css('visibility','hidden')
                        scramble_image($(this)[0], aid, scramble_id, false, speed);

                    }
                }
            });

        });
    } else {
        $("img.lazy_img,iframe.lazyload").lazyload({
            threshold: 1,
            rootMargin: '0px 0px 500px 0px',
            src: 'data-original',
            // 該callback方法有問題 改成  jquery load 監聽
            onLoadCallback: function () {
                if ($(this).parent('.scramble-page').length > 0) {
                    $(this).addClass('lazy-loaded');
                    scramble_image($(this)[0], aid, scramble_id, false, speed);
                }
            }
        });

        const observer = new IntersectionObserver(handleIntersection);
        images.forEach(image => observer.observe(image));

        //webp-hero
        // var webpMachine = new webpHero.WebpMachine();
        //
        // webpMachine.webpSupport.then(function(res){
        //     if(res === false){
        //         $('.scramble-page img').each(function () {
        //              $(this).attr('data-original',$(this).attr('data-original')+"?v=");
        //         })
        //     }
        // });

        // var converting = false;
        // var waiting_convert = [];
        // if (images.length > 0) {
        //     $('img.lazy_img').each(function () {
        //         $(this).load(function () {
        //             $(this).addClass('lazy-loaded');
        //         })
        //         $(this).on('error', function () {
        //             waiting_convert.push($(this));
        //             waiting_convert.sort();
        //         });
        //     });
        //     //確認轉換webp列隊
        //     var calc_waiting = 0;
        //     var check_waiting = setInterval(function () {
        //         if (waiting_convert.length > 0 && !converting) {
        //             converting = true;
        //             webpMachine.polyfillImage(waiting_convert[0].get(0)).then(function () {
        //                 waiting_convert.shift();
        //                 converting = false;
        //                 calc_waiting = 0;
        //             });
        //         }
        //         if (waiting_convert.length === 0) {
        //             calc_waiting++;
        //         }
        //         if (calc_waiting > 50 && waiting_convert.length === 0) {
        //             clearInterval(check_waiting)
        //         }
        //
        //     }, 500);
        // }
    }
    //
    // owl = $('.owl-carousel-page');
    // owl.on('translated.owl.carousel', function (event) {
    //     $("#pageselect").val(event.item.index);
    //     $('#phpage span').text(parseInt(event.item.index) + 1 + '/' + $('#maxpage').html())
    //
    //     $("html,body").scrollTop(0);
    //     const owlItem = document.querySelectorAll('.owl-carousel-page .owl-item');
    //     owlItem.forEach(function (e) {
    //         if (!$(e).hasClass('active')) {
    //             if ($(e).find('canvas').length > 0) {
    //                 $(e).find('canvas').remove();
    //             }
    //         } else {
    //             if ($(e).find('img').attr('src').indexOf('blank') == -1) {
    //                 scramble_image($(e).find('img')[0], aid, scramble_id, false, speed);
    //             }
    //         }
    //     });
    // }).on('load.owl.lazy', function (event) {
    //     $('#wmask').show();
    // }).on('loaded.owl.lazy', function (event) {
    //     scramble_image(event.element[0], aid, scramble_id, false, speed);
    //     $('#wmask').hide();
    // });
    //
    // owl.owlCarousel({
    //     items: 1,
    //     lazyLoad: true,
    //     dots: false,
    //     touchDrag: false,
    //     mouseDrag: false,
    //     pullDrag: false,
    //     nav: true,
    //     navText: ["", ""],
    //     smartSpeed: 50,
    //     lazyLoadEager: 3
    // });

    $('.read-next,.read-prev').click(function (e) {
        if ($(this).hasClass('read-next')) {
            owl.trigger('next.owl.carousel');
        } else {
            owl.trigger('prev.owl.carousel');
        }
    });

});

function gototop() {
    sp = $("#pageselect").val();
    if (sp !== null) {
        divid = "#page_" + sp;
        if ($(divid).length > 0) {
            settop = $(divid).offset().top - 28 - $('#Comic_Top_Nav').height();
            $("html,body").scrollTop(settop);
        }
    }
}

function refreshpage() {
    ws_top = parseInt($(window).scrollTop());
    maxpage = parseInt($("#maxpage").html());
    min = 9999999;
    nowpage = 1;

    $("div[id*='page_']").each(function () {
        paeg_top = parseInt($(this).offset().top);
        if (paeg_top > ws_top) {
            if (min > paeg_top) {
                nowpage = parseInt($(this).attr("data-page"));
                min = paeg_top;
            }
        }
    });

    $("#pageselect").val(nowpage);
    $('#phpage span').text(nowpage + 1 + '/' + $('#maxpage').html())

    page_view[aid] = nowpage;
    localStorage.setItem("page_view", JSON.stringify(page_view));
}

function ad_resize() {
    var na_path = $('#nb_path').val();
    $("." + na_path + "").each(function (i, el) {
        var height_target_id = $(this).data("height-target-id");
        var data_find = $(this).data("find")
            , data_width = $(this).data("width")
            , data_height = $(this).data("height");
        $height_target = $("#" + height_target_id);
        if (data_find) {
            $scale_target = $(this).find(data_find);
        } else {
            //$scale_target = $(this).find("a img");
            $scale_target = $(this).find("img");
        }

        if ($(this).find("iframe").length > 0) {
            $scale_target = $(this).find("iframe");
        } else if ($(this).find("div").eq(0).length > 0) {
            $scale_target = $(this).find("div").eq(0);
        }

        if ($scale_target.length == 0) {
            return;
        }

        if ($(this).hasClass('well')) {
            if (data_width == undefined) {
                data_width = 300;
            }
            if (data_height == undefined) {
                data_height = 250;
            }
        }

        var tw = data_width ? data_width : $scale_target.outerWidth();
        var th = data_height ? data_height : $scale_target.outerHeight();
        var scale = $(this).width() / tw;
        if ($height_target.length > 0) {
            $(this).css({
                "height": $height_target.outerHeight()
            });
        } else {
            $(this).css({
                "height": th * scale + ($(this).innerHeight() - $(this).height())
            });
        }
        if (th * scale > $(this).height()) {
            scale = $(this).height() / th;
        }
        var tsc = scale < 1 ? 'scale(' + scale + ',' + scale + ')' : '';
        var ml = ($(this).width() - tw * scale) / 2;
        var mt = ($(this).height() - th * scale) / 2;
        $scale_target.css({
            "transform-origin": "left top",
            '-webkit-transform': tsc,
            '-ms-transform': tsc,
            'transform': tsc,
            "margin": "0 auto !important",
            "z-index": "0"
        });

    });
}

$(document).ready(function () {
    //hidden menu
    $('.container .row .panel-body>.row').click(function () {
        var url = location.search;
        var w = $(window).width();
        if (w < 991 && url.indexOf('read-by-page') < 0) {
            $('.top-nav').toggleClass("hidden");
            $('.switch-group').toggleClass("hidden");
            $('.switch-group-block').toggleClass("hidden");
        }
    });

    $(".row.thumb-overlay-albums")[0].oncontextmenu = function () {
        return false;
    }

    $(".fas.fa-sort-down").click(function () {
        $(this).toggleClass('fa-sort-up');
        $(".menu-bolock-ul").slideToggle("slow");

        if ($(this).hasClass('fa-sort-up')) {
            $.cookie('menu-bolock', '1', {path: '/'});
        } else {
            $.cookie('menu-bolock', '0', {path: '/'});
        }
    });

    $(".speed_btn").click(function () {
        if ($("#pop-iframe").length > 0) {
            $("#pop-iframe").remove();
        }
        $("<iframe class='pop-iframe' id='pop-iframe' frameborder='no' marginheight='0' marginwidth='0' allowTransparency='true'></iframe>").prependTo('body');
        $("#pop-iframe").attr("src", base_url + '/iframe?key=' + aid)
    });

    var view = localStorage.getItem("page_view");
    view = JSON.parse(view);
    if (view !== null && view[aid] !== null) {
        $("#pageselect").val(view[aid]);
        gototop();
    }

});

window.onload = function () {
    if (speed == '1') {
        $('.rocket_animate').show();
        setTimeout(function () {
            $('.rocket_animate').hide();
        }, 1000);
    }
};

//移除iframe
window.addEventListener("message", (event) => {
    if (event.origin === base_url) {
        var result;
        try {
            result = JSON.parse(event.data);
        } catch (e) {
            result = event.data;
        }
    }
    if (result.status == 'off') {
        $("#pop-iframe").remove();
    }
    if (result.status == 'ok' && result.key != '') {
        window.location = '?speed=' + result.key;
    }
    return;
}, false);

