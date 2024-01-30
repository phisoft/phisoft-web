
/*====================================
    Ajax Mail js
======================================*/
$(function() {
    const contactForm = $("#contact-form"),
        formMessages = $('.form-messege');
    contactForm.validate({
        submitHandler: function(form){
            $.ajax({
                type: 'POST',
                url: form.action,
                data: $(form).serialize()
            })
            .done(function (response) {
                console.log(response)
                formMessages.removeClass('error text-danger').addClass('success text-success mt-3').text(response);
                // Clear the form.
                form.reset()
            })
            .fail(function (data) {
                // Make sure that the formMessages div has the 'error' class.
                formMessages.removeClass('success text-success').addClass('error text-danger mt-3');
                // Set the message text.
                if (data.responseText !== '') {
                    formMessages.text(data.responseText);
                } else {
                    formMessages.text('Oops! An error occured and your message could not be sent.');
                }
            });
        }
    });
});



/*====================================
    Ajax Mail js
======================================*/
$(function() {
    const contactForm = $("#contact-form-2"),
        formMessages = $('.form-messege-2');
    contactForm.validate({
        submitHandler: function(form){
            $.ajax({
                type: 'POST',
                url: form.action,
                data: $(form).serialize()
            })
            .done(function (response) {
                console.log(response)
                formMessages.removeClass('error text-danger').addClass('success text-success mt-3').text(response);
                // Clear the form.
                form.reset()
            })
            .fail(function (data) {
                // Make sure that the formMessages div has the 'error' class.
                formMessages.removeClass('success text-success').addClass('error text-danger mt-3');
                // Set the message text.
                if (data.responseText !== '') {
                    formMessages.text(data.responseText);
                } else {
                    formMessages.text('Oops! An error occured and your message could not be sent.');
                }
            });
        }
    });
});