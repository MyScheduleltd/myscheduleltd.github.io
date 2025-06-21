import data from './allData.js';

$(function () {
    const { drBeautyVideos } = data;

    $('.button-resume').on('click', function () {
        $('.drBeautyDialog').addClass('on');
        $('body').addClass('overflow');
    });

    $('.drBeautyContext .icon, .drBeautyDialog').on('click', function () {
        $('.drBeautyDialog').removeClass('on');
        $('body').removeClass('overflow');
    });

    // 動態產生 slide 結構
    const element = $('.profilo-swiper').find('.swiper-wrapper');
    drBeautyVideos.forEach((video, i) => {
        element.append(`
            <div class="swiper-slide">
                <div class="wrapper wrapper${i}">
                    <div class="blackScreen">
                        <div class="button" data-set="${i}">
                            <img src="./assets/logo.png"/>
                        </div>
                    </div>
                    <div class="video-container">
                        <iframe class="video" width="560" height="315" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" src=""></iframe>
                    </div>
                </div>
            </div>
        `);
    });

    // Swiper 實例
    let swiper;

    function getPaginationConfig() {
        if (window.innerWidth >= 988) {
            return {
                el: ".swiper-pagination",
                clickable: true,
                dynamicBullets: true,
                dynamicMainBullets: 1,
                renderBullet: function (index, className) {
                    return `
                        <div class="pagination-subtitle ${className}">
                            <span class="text">${drBeautyVideos[index].title}</span>
                        </div>
                    `;
                }
            };
        } else {
            return {
                el: ".swiper-pagination",
                clickable: true,
                dynamicBullets: true,
                dynamicMainBullets: 1
                // 預設圓點
            };
        }
    }

    function initSwiper() {
        if (swiper) swiper.destroy(true, true);
        // 1. 先清空 pagination DOM，避免殘留
        $('.swiper-pagination').empty();

        swiper = new Swiper('.profilo-swiper', {
            slidesPerView: 1,
            spaceBetween: 0,
            direction: 'vertical',
            pagination: getPaginationConfig(),
            on: {
                slideChange: function () {
                    updateIframe(swiper.activeIndex);
                }
            }
        });
    }

    // 只更新 src，不重複 append iframe
    function updateIframe(index) {
        stopAllYouTubeVideos();
        const videoId = youtube_parser(drBeautyVideos[index].url);
        const iframe = $(`.wrapper${index} .video`)[0];
        if (iframe) {
            iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0&loop=1&autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${videoId}`;
        }
        // 其他 slide 的 iframe src 清空
        $('.video').each(function (i) {
            if (i !== index) this.src = '';
        });
    }

    // 暫停所有 YouTube 影片
    function stopAllYouTubeVideos() {
        $('.video, .dialogvideo').each(function () {
            if (this.contentWindow) {
                this.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
        });
    }

    // 彈窗播放
    $('.swiper-wrapper').on('click', '.button', function (e) {
        stopAllYouTubeVideos();
        const set = $(this).data('set');
        $('.dialog').show();
        $('#dialog-wrapper').empty();
        $('#dialog-wrapper').append(`
            <iframe id="youtube-dialog${set + 1}" class="dialogvideo" src="https://www.youtube.com/embed/${youtube_parser(drBeautyVideos[set].url)}?rel=0&loop=1&autoplay=1&mute=0&enablejsapi=1&showinfo=0" allow='autoplay' allowfullscreen frameborder="0"></iframe>
        `);
        e.stopPropagation();
    });

    // 關閉彈窗時移除 dialog iframe
    $('.dialog .close, .dialog').on('click', function () {
        $('.dialog').hide();
        $('#dialog-wrapper').empty();
    });

    // 信件功能
    $('#submit').on('click', function (event) {
        event.preventDefault();
        let email = 'mssdrbeauty@gmail.com';
        let subject = $('#subject')[0].value || '';
        let emailBody = $('#message')[0].value || '';
        window.location = 'mailto:' + email + '?subject=' + subject + '&body=' + emailBody;
    });

    // 初始化 Swiper 與第一支影片
    initSwiper();
    updateIframe(0);

    // 視窗大小變化時自動重建 Swiper
    let resizeTimer;
    $(window).on('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            const currentIndex = swiper ? swiper.activeIndex : 0;
            initSwiper();
            updateIframe(currentIndex);
        }, 300);
    });
});

// 輔助函式
function youtube_parser(url) {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}