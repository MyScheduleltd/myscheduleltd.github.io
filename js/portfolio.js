import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'

$(function async(){
    

    const {profilo} = data;
    let i = 0;
    let element = $('.profilo-swiper').find('.swiper-wrapper')
    let videosElement = $('.profilo')
    if(profilo.length > 0){
        while( i < profilo.length ){
            element.append(`
            <div class="swiper-slide">
                <button type="button" data-id="${profilo[i].name}" data-index="${i}">${profilo[i].name}</button>
            </div>`)
            i++
        }
    }
    let storeIndex = []
    const initVideos = (i)=>{
        if(storeIndex.indexOf(i) !== -1) return ;
        storeIndex.push(i)
        videosElement.append(`<div class="videos" data-set="${profilo[i].name}"><div class="swiper-wrapper"></div><div class="swiper-pagination"></div></div>`)
        profilo[i].profilo.forEach((current,index)=>{
            videosElement.find(`.videos[data-set="${profilo[i].name}"]`).find('.swiper-wrapper').append(`
            <div class="swiper-slide">
                <div class="wrapper wrapper${index}">
                    <div class="blackScreen">
                        <div class="button" data-profilotext="${index}" data-profilo="${i}">
                            <img src="../assets/logo.png"/>
                        </div>
                    </div>
                    
                </div>
            </div>`
            )
        })

        let swiper = new Swiper(`.videos[data-set="${profilo[i].name}"]`, {
            slidesPerView:1,
            spaceBetween: 0,
            // loop: true,
            // mousewheel: true,
            // observer: true
            direction: 'vertical',
            // loop: true,
            // mousewheel: true,
            // observer: true,
            pagination: {
                el: ".swiper-pagination",
                clickable: true,
                dynamicBullets: true,
                renderBullet: function (index, className) {
                    return `
                        <div class="pagination-subtitle ${className}" >
                            <span class="text"> ${profilo[i].profilo[index].title}</span>
                        </div>
                    `;
                }
            },
        });
        let storeForIframe = [];
        if(storeForIframe.length < 1){
            updateIframe()
        }

        function updateIframe() {
            let currentIndex = swiper.activeIndex;
            if(storeForIframe.indexOf(currentIndex) !== -1) return;
            storeForIframe.push(currentIndex);
            let currentUrl = profilo[i].profilo[currentIndex].url;
            console.log(swiper.activeIndex,profilo[i],'testInit')
            videosElement.find(`.videos[data-set="${profilo[i].name}"]`).find('.swiper-wrapper').find(`.wrapper${currentIndex}`).append(`
                <iframe id="youtube${currentIndex+1}" class="video" src="https://www.youtube.com/embed/${youtube_parser(currentUrl)}?rel=0&loop=1&amp;autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(currentUrl)}"  frameborder="0" allowfullscreen></iframe>
            `)

        }
       
        swiper.on('slideChange', function () {
            // console.log(swiper.activeIndex,profilo[i],'test')
            updateIframe();
            // let currentIndex = swiper.activeIndex;
            // let currentUrl = profilo[i].profilo[currentIndex].url;
            // videosElement.find(`.videos[data-set="${profilo[i].name}"]`).find('.swiper-wrapper').find(`.wrapper${currentIndex}`).append(`
            //     <iframe id="youtube${currentIndex+1}" class="video" src="https://www.youtube.com/embed/${youtube_parser(currentUrl)}?rel=0&loop=1&amp;autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(currentUrl)}"  frameborder="0" allowfullscreen></iframe>
            // `)
        });
        $('.videos .swiper-wrapper').on('click', '.button', function(){
            stopAllYouTubeVideos();
            const mainSet = $(this).data('profilo');
            const subSet  = $(this).data('profilotext')
            const getURL = profilo[mainSet].profilo[subSet].url;
            $('.dialog').show()
            $('#dialog-wrapper').empty();
            $('#dialog-wrapper').append(`
                <iframe id="youtube${mainSet+1}" class="dialogvideo" src="https://www.youtube.com/embed/${youtube_parser(getURL)}?rel=0&loop=1&amp;autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(getURL)}"  frameborder="0"></iframe>
            `)
            // do something here
        });
    }


$('.profilo-swiper').on('click','button',function(e){
    console.log('swiper clicked '+ e.target.dataset.id);
    let currentName = e.target.dataset.id;
    initVideos(e.target.dataset.index)
    
    let videosElement = $('.profilo')
    $('.profilo-swiper').find('button').removeClass('active');
    e.target.className = 'active'

    videosElement.find(`.videos[data-set="${currentName}"]`).show().siblings().hide();
})
var stopAllYouTubeVideos = () => { 
    var iframes = document.querySelectorAll('.video');
    Array.prototype.forEach.call(iframes, iframe => { 
        iframe.contentWindow.postMessage('{"event":"command","func":"' + 'pauseVideo' + '","args":""}', '*');
    });
}


    const initSwiper = () => {
        let swiper = new Swiper('.profilo-swiper', {
            spaceBetween: 0,
            slidesPerView: 4,
            slideToClickedSlide: true,
            // loop: true,
            // mousewheel: true,
            // observer: true
        });
    }
    initSwiper();
    $('.profilo-swiper button').eq(0).click();
})
