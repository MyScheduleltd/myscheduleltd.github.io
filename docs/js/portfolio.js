import data from './allData.js';

$(function () {
    const { profilo } = data;
    let element = $('.profilo-swiper').find('.swiper-wrapper');
    let videosElement = $('.profilo');

    // 建立主選單
    profilo.forEach((item, i) => {
        element.append(`
            <div class="swiper-slide">
                <button type="button" data-id="${item.name}" data-index="${i}">${item.name}</button>
            </div>`);
    });

    // 建立影片區塊（每個主題一個 videos 區塊，裡面只有一個 iframe）
    profilo.forEach((item, i) => {
        videosElement.append(`
            <div class="videos" data-set="${item.name}" style="display:none;">
                <div class="swiper-wrapper"></div>
                <div class="swiper-pagination"></div>
                <div class="video-container">
                    <iframe class="video" width="560" height="315" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" src=""></iframe>
                </div>
            </div>`);
        // 建立 swiper slides
        item.profilo.forEach((current, index) => {
            videosElement.find(`.videos[data-set="${item.name}"] .swiper-wrapper`).append(`
                <div class="swiper-slide" data-url="${current.url}">
                    <div class="wrapper wrapper${index}">
                        <div class="blackScreen">
                            <div class="button" data-profilotext="${index}" data-profilo="${i}">
                                <img src="./assets/logo.png"/>
                            </div>
                        </div>
                    </div>
                </div>`);
        });
        // 判斷是否加上 auto-height-pagination
        let isEnableLoop = item.profilo.length < 5;
        if (isEnableLoop) {
            $(`.videos[data-set="${item.name}"] .swiper-pagination`).addClass('auto-height-pagination');
        }
    });

    // Swiper 實例管理
    let swiperInstances = {};

    function initVideos(i) {
        const item = profilo[i];
        const swiperSelector = `.videos[data-set="${item.name}"] .swiper-wrapper`;
        // 若已存在則不重複初始化
        if (swiperInstances[item.name]) return;

        let swiper = new Swiper(`.videos[data-set="${item.name}"]`, {
            slidesPerView: 1,
            direction: 'vertical',
            observer: true,
            pagination: {
                el: ".swiper-pagination",
                clickable: true,
                dynamicBullets: true,
                renderBullet: function (index, className) {
                    return `
                        <div class="pagination-subtitle ${className}">
                            <span class="text">${item.profilo[index].title}</span>
                        </div>
                    `;
                }
            }
        });

        swiperInstances[item.name] = swiper;

        // 初始化時載入第一個影片
        updateIframe(item.name, 0);

        swiper.on('slideChange', function () {
            updateIframe(item.name, swiper.activeIndex);
        });
    }

    // 只更新 src，不移除 iframe
    function updateIframe(name, index) {
        const item = profilo.find(p => p.name === name);
        const videoId = youtube_parser(item.profilo[index].url);
        const iframe = $(`.videos[data-set="${name}"] .video`)[0];
        if (iframe) {
            iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${videoId}`;
        }
    }

    // ----------- 新增：主選單 Swiper 實例管理與 direction 切換 -----------
    let menuSwiper;
    function getMenuSwiperDirection() {
        return window.innerWidth >= 988 ? 'horizontal' : 'vertical';
    }
    function initMenuSwiper() {
        // 銷毀舊的
        if (menuSwiper) menuSwiper.destroy(true, true);
        menuSwiper = new Swiper('.profilo-swiper', {
            spaceBetween: 0,
            slidesPerView: 'auto',
            slideToClickedSlide: true,
            direction: getMenuSwiperDirection(),
        });
    }
    // ---------------------------------------------------------------

    // 主選單點擊
    $('.profilo-swiper').on('click', 'button', function (e) {
        const i = $(this).data('index');
        const name = $(this).data('id');
        $('.profilo-swiper button').removeClass('active');
        $(this).addClass('active');
        $('.videos').hide();
        $(`.videos[data-set="${name}"]`).show();
        initVideos(i);
        // 切換時預設載入第一個影片
        updateIframe(name, 0);
        // Swiper 也要切回第一個 slide
        if (swiperInstances[name]) {
            swiperInstances[name].slideTo(0, 0);
        }
    });

    // 頁面初始化
    const firstName = profilo[0].name;
    $(`.videos[data-set="${firstName}"]`).show();
    $('.profilo-swiper button').eq(0).addClass('active');
    initVideos(0);
    updateIframe(firstName, 0);

    // 初始化主選單 Swiper
    initMenuSwiper();

    // 監聽視窗大小變化，自動切換 vertical/horizontal
    let resizeTimer;
    $(window).on('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            initMenuSwiper();
        }, 300);
    });

    // 彈窗播放
    videosElement.off('click', '.button').on('click', '.button', function () {
        const mainSet = $(this).data('profilo');
        const subSet = $(this).data('profilotext');
        const getURL = profilo[mainSet].profilo[subSet].url;
        $('.dialog').show();
        $('#dialog-wrapper').empty();
        $('#dialog-wrapper').append(`
            <iframe class="dialogvideo" src="https://www.youtube.com/embed/${youtube_parser(getURL)}?rel=0&autoplay=1&loop=1&enablejsapi=1&showinfo=0" allow='autoplay' allowfullscreen frameborder="0"></iframe>
        `);
    });

    // 關閉彈窗時移除 dialog iframe
    $('.dialog .close').on('click', function () {
        $('.dialog').hide();
        $('#dialog-wrapper').empty();
    });
});

// 輔助函式
function youtube_parser(url) {
    // 解析 YouTube 影片 ID
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
}