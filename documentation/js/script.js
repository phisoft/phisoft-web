"use strict";


(function () {

  /**
   * Global variables
   */
  var userAgent = navigator.userAgent.toLowerCase(),
    initialDate = new Date(),
    
    $window = $(window),
    $html = $("html"),

    isDesktop = $html.hasClass("desktop"),
    isIE = userAgent.indexOf("msie") !== -1 ? parseInt(userAgent.split("msie")[1], 10) : userAgent.indexOf("trident") !== -1 ? 11 : userAgent.indexOf("edge") !== -1 ? 12 : false,
    windowReady = false,
    isNoviBuilder = false,
    
    plugins = {
      pointerEvents: isIE < 11 ? "js/pointer-events.min.js" : false,
      rdNavbar: $(".rd-navbar"),
      preloader: $(".preloader"),
      copyrightYear: $(".copyright-year"),
      sidebar: $('.rd-navbar-sidebar-inner'),
      lightGallery: $("[data-lightgallery='group']"),
      lightGalleryItem: $("[data-lightgallery='item']")
    };

  // Initialize scripts that require a loaded page
  $window.on('load', function () {
    // Page loader & Page transition
    if (plugins.preloader.length && !isNoviBuilder) {
      pageTransition({
        target: document.querySelector('.page'),
        delay: 0,
        duration: 500,
        classActive: 'animated',
        conditions: function (event, link) {
          return !/(\#|callto:|tel:|mailto:|:\/\/)/.test(link) && !event.currentTarget.hasAttribute('data-lightgallery') && event.currentTarget.getAttribute('href') !== 'javascript:void(0);';
        },
        onTransitionStart: function ( options ) {
          setTimeout( function () {
            plugins.preloader.removeClass('loaded');
          }, options.duration * .75 );
        },
        onReady: function () {
          plugins.preloader.addClass('loaded');
          windowReady = true;
        }
      });
    }
  });
  
  // Initialize All Scripts
  $(function () {
    var isNoviBuilder = window.xMode;

    // Copyright Year 
    if (plugins.copyrightYear.length) {
      plugins.copyrightYear.text(initialDate.getFullYear());
    }

    // IE Polyfills
    if (isIE) {
      if (isIE < 10) {
        $html.addClass("lt-ie-10");
      }

      if (isIE < 11) {
        if (plugins.pointerEvents) {
          $.getScript(plugins.pointerEvents)
            .done(function () {
              $html.addClass("ie-10");
              PointerEventsPolyfill.initialize({});
            });
        }
      }

      if (isIE === 11) {
        $html.addClass("ie-11");
      }

      if (isIE === 12) {
        $html.addClass("ie-edge");
      }
    }

    // UI To Top
    if (isDesktop && !isNoviBuilder) {
      $().UItoTop({
        easingType: 'easeOutQuart',
        containerClass: 'ui-to-top fa fa-angle-up'
      });
    }

    // RD Navbar
    if (plugins.rdNavbar.length) {
      plugins.rdNavbar.RDNavbar({
        anchorNav: !isNoviBuilder,
        anchorNavSpeed: 600,
        stickUpClone: (plugins.rdNavbar.attr("data-stick-up-clone") && !isNoviBuilder) ? plugins.rdNavbar.attr("data-stick-up-clone") === 'true' : false,
        responsive: {
          0: {
            stickUp: (!isNoviBuilder) ? plugins.rdNavbar.attr("data-stick-up") === 'true' : false
          },
          768: {
            stickUp: (!isNoviBuilder) ? plugins.rdNavbar.attr("data-sm-stick-up") === 'true' : false
          },
          992: {
            stickUp: (!isNoviBuilder) ? plugins.rdNavbar.attr("data-md-stick-up") === 'true' : false
          },
          1200: {
            stickUp: (!isNoviBuilder) ? plugins.rdNavbar.attr("data-lg-stick-up") === 'true' : false
          }
        },
        callbacks: {
          onStuck: function () {
            var navbarSearch = this.$element.find('.rd-search input');

            if (navbarSearch) {
              navbarSearch.val('').trigger('propertychange');
            }
          },
          onDropdownOver: function(){
            return !isNoviBuilder;
          },
          onUnstuck: function () {
            if (this.$clone === null)
              return;

            var navbarSearch = this.$clone.find('.rd-search input');

            if (navbarSearch) {
              navbarSearch.val('').trigger('propertychange');
              navbarSearch.trigger('blur');
            }
          },
          onAnchorChange: function(){
            var anchorFunc = $(this).attr('id'),
                linkAnchor = $('[href*="#'+ anchorFunc +'"]');
            $('.rd-navbar-dropdown li').removeClass( 'active opened' );
            $('.rd-navbar-nav li').removeClass( 'active opened' );
            linkAnchor.parent().addClass( 'active opened' );
            linkAnchor.parents('.rd-navbar-nav > li').addClass( 'active opened' );
          }
        }
      });

      if (plugins.rdNavbar.attr("data-body-class")) {
        document.body.className += ' ' + plugins.rdNavbar.attr("data-body-class");
      }
      
    }

    // lightGallery
    function initLightGallery(itemsToInit, addClass) {
      if (itemsToInit.length && !isNoviBuilder) {
        $(itemsToInit).lightGallery({
          thumbnail: true,
          selector: "[data-lightgallery='group-item']",
          addClass: addClass
        });
      }
    }

    function initLightGalleryItem(itemToInit, addClass){
      if (itemToInit.length && !isNoviBuilder) {
        $(itemToInit).lightGallery({
          selector: "this",
          addClass: addClass,
          counter: false,
          youtubePlayerParams: {
            modestbranding: 1,
            showinfo: 0,
            rel: 0,
            controls: 0
          },
          vimeoPlayerParams: {
            byline : 0,
            portrait : 0
          }
        });
      }
    }

    if (plugins.lightGallery.length) {
      initLightGallery(plugins.lightGallery);
    }

    if (plugins.lightGalleryItem.length) {
      initLightGalleryItem(plugins.lightGalleryItem);
    }

    // bootstrap affix
    if($window.width() > 767 && plugins.sidebar.length) {
      $(function(){
        // side bar
        plugins.sidebar.affix({
          offset: {
            top: plugins.sidebar.offset().top
          }
        })
      });
    }
    
    // Pretty Print
    window.prettyPrint && prettyPrint();
    $('#nav_container').affix({
      offset: {
        top: 80
      }
    });
    
  });
}());

