/**
      .                              .o8                     oooo
   .o8                             "888                     `888
 .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
   888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
   888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
   888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
   "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 ========================================================================
 Created:    02/10/2015
 Author:     Chris Brame

 **/

"use strict";

var _                   = require('underscore');
var path                = require('path');
var async               = require('async');
var winston             = require('winston');
var emitter             = require('../emitter');
var ticketSchema        = require('../models/ticket');
var notificationSchema  = require('../models/notification');
var mailqueue           = require('../mailer/mailqueue');
var emailTemplates      = require('email-templates');
var templateDir         = path.resolve(__dirname, '..', 'mailer', 'templates');

(function() {
    //winston.info('Binding to Events');
    emitter.on('ticket:created', function(ticketOid) {
         ticketSchema.getTicketById(ticketOid, function(err, ticket) {
             if (err) return true;

             async.parallel([
                 function(c) {
                     var mailer = require('../mailer');
                     var emails = [];
                     async.each(ticket.group.members, function(member, cb) {
                         if (_.isUndefined(member.email)) return;

                         emails.push(member.email);

                         cb();
                     }, function(err) {
                         if (err) return c(err);

                         emails = _.uniq(emails);

                         emailTemplates(templateDir, function(err, template) {
                             if (err) {
                                 winston.error(err);
                             } else {
                                 var locals = {
                                     ticket: ticket
                                 };

                                 template('new-ticket', locals, function(err, html) {
                                     if (err) {
                                         winston.error(err);
                                     } else {
                                         var mailOptions = {
                                             from: 'no-reply@trudesk.io',
                                             to: emails.join(),
                                             subject: 'Ticket #' + ticket.uid + '-' + ticket.subject,
                                             html: html,
                                             generateTextFromHTML: true
                                         };

                                         mailer.sendMail(mailOptions, function(err, info) {
                                             if (err) {
                                                 winston.warn(err);
                                                 return c(err, null);
                                             }


                                             return c(null, info);
                                         });
                                     }
                                 });
                             }
                         });
                     });
                 },
                 function (c) {
                     async.each(ticket.group.members, function(member, cb) {
                         if (_.isUndefined(member)) return true;

                         var notification = new notificationSchema({
                             owner: member,
                             title: 'Ticket #' + ticket.uid + ' Created',
                             message: ticket.subject,
                             type: 0,
                             data: {ticketuid: ticket.uid},
                             unread: true
                         });

                         notification.save(function(err, data) {
                             if (err) return cb(err);

                             cb(null, data);
                         });

                     }, function(err) {
                         c(err);
                     });
                 }
             ], function(err) {
                    if (err) {
                        winston.warn('Error: Event: ticket:created');
                        return winston.warn(err.message);
                    }
             });
         });
    });

    emitter.on('ticket:updated', function(ticketOid) {

    });

    emitter.on('ticket:deleted', function(oId) {
        io.sockets.emit('ticket:delete', oId);
        winston.warn('ticket deleted: ' + oId);
    });

})();