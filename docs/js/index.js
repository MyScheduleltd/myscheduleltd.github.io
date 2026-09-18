import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'
$(function async(){

    const {homeVideos} = data;
    let i = 0;
    const initSwiper = () => {
        let swiper = new Swiper('.indexSwiper', {
            slidesPerView:1,
            spaceBetween: 0,
            direction: 'vertical',
            // loop: true,
            autoHeight:true,
            mousewheel: true,
            observer: true,
            // pagination: {
            //     el: ".swiper-pagination",
            //     clickable: false,
            //     dynamicBullets: false,

            // },
        });
    }
    const init = ()=>{
        let element =$('.indexSwiper').find('.swiper-wrapper')
        while( i < homeVideos.length ){
            element.append(`
            <div class="swiper-slide">
                
                <div class="wrapper">
                    <div class="blackScreen">
                        <div class="button" data-set="${i}" >
                            <img src="./assets/logo.png"/>
                        </div>
                    </div>
                    <iframe id="youtube${i+1}" class="video" src="${homeVideos[i].url.split('?')[0]}?rel=0&loop=1&autoplay=1&mute=1&playsinline=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(homeVideos[i].url)}"  frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
                </div>
            </div>`)
            i++
        }
    }
    const gogo = async() =>{
        await init();
        await initSwiper();
    }

    var stopAllYouTubeVideos = () => { 
        var iframes = document.querySelectorAll('.video');
        Array.prototype.forEach.call(iframes, iframe => { 
          iframe.contentWindow.postMessage('{"event":"command","func":"' + 'pauseVideo' + '","args":""}', '*');
       });
      }
    $('.swiper-wrapper').on('click', '.button', function(){
        stopAllYouTubeVideos();
        const set  = $(this).data('set')
        $('.dialog').show()
        $('#dialog-wrapper').empty();
        $('#dialog-wrapper').append(`
            <iframe id="youtube-dialog${set+1}" class="dialogvideo" src="${homeVideos[set].url.split('?')[0]}?rel=0&loop=1&autoplay=1&mute=0&enablejsapi=1&showinfo=0"  allow='autoplay' allowfullscreen frameborder="0" ></iframe>
        `)
        var dialogiframes = document.querySelectorAll('.dialogvideo');
        Array.prototype.forEach.call(dialogiframes, dialogiframe => { 
            dialogiframe.contentWindow.postMessage('{"event":"command","func":"' + 'playVideo' + '","args":""}', '*');
        });
        // do something here
    });
    


    gogo();
})
