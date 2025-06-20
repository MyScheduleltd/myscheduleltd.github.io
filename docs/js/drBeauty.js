import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'
$(function async(){
    const { drBeautyVideos } = data;
    $('.button-resume').on('click',function(){
        $('.drBeautyDialog').addClass('on')
        $('body').addClass('overflow')
    })

    $('.drBeautyContext .icon').on('click',function(){
        $('.drBeautyDialog').removeClass('on')
        $('body').removeClass('overflow')
    })

    $('.drBeautyDialog').on('click',function(){
        $('.drBeautyDialog').removeClass('on')
        $('body').removeClass('overflow')
    })

    const initSwiper = () => {
        let swiper = new Swiper('.profilo-swiper', {
            slidesPerView:1,
            spaceBetween: 0,
            direction: 'vertical',
            
            // loop: true,
            // mousewheel: true,
            // observer: true,
            pagination: {
                el: ".swiper-pagination",
                clickable: true,
                dynamicBullets: true,
                dynamicMainBullets: 5
            },
            breakpoints: {
                988: {
                    pagination: {
                        renderBullet: function (index, className) {
                            return `
                                <div class="pagination-subtitle ${className}" >
                                    <span class="text"> ${drBeautyVideos[index].title}</span>
                                </div>
                            `;
                        }
                    },
                },
            },
        });
        const debounce = (func, delay) => {
            let debounceTimer
            return function () {
                const context = this
                const args = arguments
                clearTimeout(debounceTimer)
                debounceTimer
                    = setTimeout(() => func.apply(context, args), delay)
            }
        }

        let storeForIframe = [];
        if(storeForIframe.length < 1){
            updateIframe()
        }
        function updateIframe () {
            let currentIndex = swiper.activeIndex;
            if(storeForIframe.indexOf(currentIndex) !== -1) {
                return;
            };
            storeForIframe.push(currentIndex);
            let currentIframe = $('.profilo-swiper').find(`.wrapper${currentIndex}`);
            currentIframe.append(`<iframe id="youtube${currentIndex+1}" class="video" src="${drBeautyVideos[currentIndex].url}?rel=0&loop=1&amp;autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(drBeautyVideos[currentIndex].url)}"  frameborder="0" allowfullscreen></iframe>`)
            
        }
        const swiperUpdate = async ()=>{
                // console.log(swiper.activeIndex,profilo[i],'test')
                // updateIframe();
                stopAllYouTubeVideos();
                updateIframe();
                let currentIndex = swiper.activeIndex;
        
                let iframe = document.getElementById(`youtube${currentIndex+1}`);
                // currentSwiper = {...currentSwiper, [profilo[i].name]: swiper.activeIndex}
                iframe.contentWindow.postMessage('{"event":"command","func":"' + 'playVideo' + '","args":""}', '*');
                // let currentIndex = swiper.activeIndex;
                // let currentUrl = profilo[i].profilo[currentIndex].url;
                // videosElement.find(`.videos[data-set="${profilo[i].name}"]`).find('.swiper-wrapper').find(`.wrapper${currentIndex}`).append(`
                //     <iframe id="youtube${currentIndex+1}" class="video" src="https://www.youtube.com/embed/${youtube_parser(currentUrl)}?rel=0&loop=1&amp;autoplay=1&mute=1&enablejsapi=1&showinfo=0&playlist=${youtube_parser(currentUrl)}"  frameborder="0" allowfullscreen></iframe>
                // `)
        }
    
        const debounceSwiper = debounce(swiperUpdate, 400)
        swiper.on('slideChange', function () {
            debounceSwiper();
        });
    }


    let i =0;
    const init = ()=>{
        let element =$('.profilo-swiper').find('.swiper-wrapper')
        while( i < drBeautyVideos.length ){
            element.append(`
            <div class="swiper-slide">
                
                <div class="wrapper wrapper${i}">
                    <div class="blackScreen">
                        <div class="button" data-set="${i}" >
                            <img src="./assets/logo.png"/>
                        </div>
                    </div>
                    
                </div>
            </div>`)
            i++
        }
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
            <iframe id="youtube-dialog${set+1}" class="dialogvideo" src="${drBeautyVideos[set].url}?rel=0&loop=1&autoplay=1&mute=0&enablejsapi=1&showinfo=0"  allow='autoplay' allowfullscreen frameborder="0" ></iframe>
        `)
        // do something here
    });


    const gogo = async() =>{
        await init();
        await initSwiper();
        await debounceSwiper();
    }

    $('#submit').on('click', function(event){
        event.preventDefault();
        let email = 'mssdrbeauty@gmail.com';
        let subject = $('#subject')[0].value || '';
        let emailBody = $('#message')[0].value || '';
        window.location = 'mailto:' + email + '?subject=' + subject + '&body=' + emailBody;
    })
    gogo();

})
