import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'
$(function async(){
    

    const {aboutVideos , memberData} = data;
    $('.videos-wrapper').append(`
        <div class="iframe-videos">
            <iframe  class="video" src="${aboutVideos[0].url}?rel=0&autoplay=1&mute=1&enablejsapi=1&showinfo=0&loop=1&playlist=${youtube_parser(aboutVideos[0].url)}"  allow='autoplay' allowfullscreen  frameborder="0" ></iframe>
        </div>
    `)

    $('#submit').on('click', function(event){
        event.preventDefault();
        let email = 'santana30541@gmail.com';
        let subject = $('#subject')[0].value || '';
        let emailBody = $('#message')[0].value || '';
        window.location = 'mailto:' + email + '?subject=' + subject + '&body=' + emailBody;
    })
    
    const footer =  $('.footer').innerHeight();
    if(window.innerWidth > 960){
        $('.contact-us').css('height',`calc(100vh - ${footer+1}px)`)
    }
    
})
