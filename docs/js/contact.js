import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'
$(function async(){
    

    const {aboutVideos , memberData} = data;
    $('.videos-wrapper').append(`
        <div class="iframe-videos">
            <iframe  class="video" src="${aboutVideos[0].url.split('?')[0]}?rel=0&autoplay=1&mute=1&playsinline=1&enablejsapi=1&showinfo=0&loop=1&playlist=${youtube_parser(aboutVideos[0].url)}"  allow='autoplay' allowfullscreen  frameborder="0" ></iframe>
        </div>
    `)

    
    const footer =  $('.footer').innerHeight();
    if(window.innerWidth > 960){
        $('.contact-us').css('height',`calc(100vh - ${footer+1}px)`)
    }
    
})
