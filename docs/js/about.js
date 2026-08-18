import data from './allData.js';
// import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@10/swiper-bundle.min.mjs'
$(function async(){
    

    const {aboutVideos , memberData} = data;
    $('.aboutVideos1').append(`
        <div class="iframe-videos">
            <iframe  class="video" src="${aboutVideos[0].url}?rel=0&autoplay=1&mute=1&enablejsapi=1&showinfo=0&loop=1&playlist=${youtube_parser(aboutVideos[0].url)}"  allow='autoplay' allowfullscreen  frameborder="0" ></iframe>
        </div>
    `)
    $('.aboutVideos2').append(`
        <div class="iframe-videos">
            <iframe  class="video" src="${aboutVideos[1].url}?rel=0&autoplay=1&mute=1&enablejsapi=1&showinfo=0&loop=1&playlist=${youtube_parser(aboutVideos[1].url)}"  allow='autoplay' allowfullscreen frameborder="0" ></iframe>
        </div>
    `)

    var stopAllYouTubeVideos = () => { 
        var iframes = document.querySelectorAll('.video');
        Array.prototype.forEach.call(iframes, iframe => { 
          iframe.contentWindow.postMessage('{"event":"command","func":"' + 'pauseVideo' + '","args":""}', '*');
       });
    }
    // The team board is on hold. Its markup lives in the page now, so nothing
    // is appended here; memberData is left in place for when it comes back.
    for(let i = 0; i < 0; i++) {

        // $('.member-container').append(`
        //     <div class="member">
        //         <div class="flip_wrap">
        //             <!--实现容器翻转-->
        //             <div class="flip">
        //                 <!--正面-->
        //                 <div class="side front">
        //                     <img src="${memberData[i].member}" />
        //                 </div>
        //                 <!--反面-->
        //                 <div class="side back">
        //                     <p class="title">${memberData[i].title}</p>
        //                     <p>${memberData[i].jobPos}</p>
        //                 </div>
        //             </div>
        //         </div>
               
        //     </div>`)


    }
    
    $('.videos-wrapper').on('click', '.button', function(){
        stopAllYouTubeVideos();
        const set  = $(this).data('set')
        $('.dialog').show()
        $('#dialog-wrapper').empty();
        $('#dialog-wrapper').append(`
            <iframe id="youtube-dialog${set+1}" class="dialogvideo" src="${aboutVideos[set].url}?rel=0&autoplay=1&loop=1&enablejsapi=1&showinfo=0"  allow='autoplay' allowfullscreen frameborder="0" ></iframe>
        `)
        var dialogiframes = document.querySelectorAll('.dialogvideo');
        Array.prototype.forEach.call(dialogiframes, iframes => { 
            iframes.contentWindow.postMessage('{"event":"command","func":"' + 'stopVideo' + '","args":""}', '*');
        });
        // do something here
    });
    
})
