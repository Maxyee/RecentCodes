using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web;
using System.Web.Http;
using System.Web.Http.Cors;
using glostars.Models;
using glostars.Models.Api;
using Microsoft.AspNet.Identity;
using Microsoft.AspNet.Identity.Owin;
using Microsoft.Owin.Security;
using Comment = glostars.Models.Api.Comment;
using Rating = glostars.Models.Api.Rating;
using WeeklyRating = glostars.Models.Api.WeeklyRating;
using UserPicturesViewModel = glostars.Models.Api.UserPicturesViewModel;

namespace glostars.Controllers.Api.Android
{
    [EnableCors("*", "*", "*")]
    [System.Web.Http.Authorize]
    [System.Web.Http.RoutePrefix("cannot/share/apiaddress")]
    public class FeedAndroidController : ApiController
    {
        private readonly ApplicationDbContext _context = new ApplicationDbContext();
        public ApplicationDbContext Db = new ApplicationDbContext();
        private ApplicationUserManager _userManager;
        private HomeController homeController = new HomeController();

        public FeedAndroidController(ApplicationUserManager userManager,
            ISecureDataFormat<AuthenticationTicket> accessTokenFormat)
        {
            UserManager = userManager;
            AccessTokenFormat = accessTokenFormat;
        }

        public FeedAndroidController()
        {
        }

        public ApplicationUserManager UserManager
        {
            get
            {
                return _userManager ?? HttpContext.Current.GetOwinContext().GetUserManager<ApplicationUserManager>();
            }
            private set { _userManager = value; }
        }

        public ISecureDataFormat<AuthenticationTicket> AccessTokenFormat { get; private set; }


        private IEnumerable<Models.Api.WeeklyRating> FetchWeeklyRatings(WeeklyCompetitionClient pic)
        {
            return pic.WeeklyRatings.Select(MvCtoApiWeeklyRating).ToList();
        }


        public Models.Api.Comment MvCtoApiComment(Models.Comment comment)
        {
            var replies = _context.Replies.Where(x => x.CommentId == comment.CommentId).ToList();
            return new Models.Api.Comment
            {
                CommentId = comment.CommentId,
                CommentMessage = comment.CommentMessage,
                CommentTime = comment.CommentTime.ToUniversalTime(),
                CommenterId = comment.CommentUserNameId,
                CommenterUserName = comment.CommentUserName.UserName,
                ProfilePicUrl = comment.CommentUserName.GetProfilePictureThumb(Sizes.big),
                ProfilePicUrlMedium = comment.CommentUserName.GetProfilePictureThumb(Sizes.medium),
                ProfilePicUrlMini = comment.CommentUserName.GetProfilePictureThumb(Sizes.mini),
                ProfilePicUrlSmall = comment.CommentUserName.GetProfilePictureThumb(Sizes.small),
                FirstName = comment.CommentUserName.Name,
                LastName = comment.CommentUserName.LastName,
                IsBrandAmbassador = comment.CommentUserName.IsBrandAmbassador,
                IsVerified = comment.CommentUserName.IsVerified,
                Replies = GetReplies(replies)
            };
        }

        public List<ReplyModel> GetReplies(List<Reply> replies)
        {
            List<ReplyModel> replyModels = new List<ReplyModel>();
            foreach(var reply in replies)
            {
                replyModels.Add(new ReplyModel
                {
                    ReplyId = reply.ReplyId,
                    ReplyMessage = reply.ReplyMessage,
                    ReplyTime = reply.ReplyTime,
                    ReplyUserNameId = reply.ReplyUserNameId,
                    CommentId = reply.CommentId,
                    PictureId = reply.PictureId,
                    FirstName = reply.ReplyUserName.Name,
                    LastName = reply.ReplyUserName.LastName,
                    ProfilePicUrl = reply.ReplyUserName.GetProfilePictureThumb(Sizes.big),
                    IsBrandAmbassador = reply.ReplyUserName.IsBrandAmbassador,
                    IsVerified = reply.ReplyUserName.IsVerified
                });
            }
            return replyModels;
        }



        public Models.Api.Rating MvCtoApiRating(Models.Rating rating)
        {
            return new Models.Api.Rating
            {
                RaterId = rating.UserId,
                RatingTime = rating.Date,
                StarsCount = rating.Stars
            };
        }


        public Models.Api.WeeklyRating MvCtoApiWeeklyRating(Models.WeeklyRating rating)
        {
            return new WeeklyRating
            {
                RaterId = rating.UserId,
                RatingTime = rating.Date,
                StarsCount = rating.Stars
            };
        }



        private IEnumerable<Comment> FetchComments(Picture pic)
        {
            string MyId = User.Identity.GetUserId();
            return pic.Comments.Where(x => !_context.Blocks.Any(w => ((w.BlockedWhomUserId == x.CommentUserNameId && w.BlockedByUserId == MyId) || (w.BlockedWhomUserId == MyId && w.BlockedByUserId == x.CommentUserNameId)) && w.IsBlock)).OrderByDescending(p => p.CommentTime).Select(MvCtoApiComment).ToList();
            
        }


        private IEnumerable<Rating> FetchRatings(Picture pic)
        {
            return pic.Ratings.Select(MvCtoApiRating).ToList();
        }


        [System.Web.Http.HttpPost]
        [System.Web.Http.Route("mutualpic/{userId}/{count}")]
        public IHttpActionResult GetMutualPictures(string userId, int count, ListOfPhotoId photos)
        {
            if (count > 0)
            {
                count = count - 1;
            }
            var response = new ApiResponseModel();
            string MyId = userId;
            ApplicationUser MyUser = _context.Users.FirstOrDefault(w => w.Id == userId);

            try
            {
                if (MyUser == null)
                {
                    response.ResponseCode = ResponseCodes.Failed;
                    response.Message = "User not found";
                    return Ok(response);
                }


                var listPhoto = new HashSet<int>();

                if (photos.ListPhoto != null)
                {
                    foreach (int lp in photos.ListPhoto)
                    {
                        Debug.WriteLine(lp.ToString());
                        listPhoto.Add(lp);
                    }
                }


                var model = new UserPicturesViewModel
                {
                    UserId = userId
                };

                Debug.Assert(MyUser != null, "appUser != null");
                int totalmutualFollowerPics = 0;


                List<Activity> mutualFollowerActivites = Db.Activities.Where(
                        a => ((Db.UserPrivacys.Any(x => ((x.PermissionByUserId == a.UserId && x.PermissionWhomUserId == MyId) && x.Permission == "Insider")) && a.User.FollowerList.Any(b => MyId == b.Id))
                              || (a.User.FollowerList.Any(b => MyId == b.Id) && a.Picture.Privacy != "friends")
                              || (a.UserId == MyId))
                             && !listPhoto.Contains(a.PictureId)
                             && !a.Picture.IsCompeting
                             && !a.Picture.IsRemoved
                             && (
                                 (a.UserId == MyId) ||
                                 !Db.Blocks.Any(
                                     x =>
                                         (((x.BlockedWhomUserId == a.UserId && x.BlockedByUserId == MyId) ||
                                           (x.BlockedByUserId == a.UserId && x.BlockedWhomUserId == MyId)) && x.IsBlock))
                             ))
                    .OrderByDescending(q => q.Date)
                    .Skip(count * 5)
                    .Take(5)
                    .ToList();


                model.MutualFollowerPictures = mutualFollowerActivites.Select(MvCtoApiPicture).ToList();
                totalmutualFollowerPics = (count * 10) + model.MutualFollowerPictures.Count();


                if (!model.MutualFollowerPictures.Any())
                {
                    totalmutualFollowerPics = Db.Activities.Count(
                        a =>
                            ((a.User.FollowingList.Any(b => MyId == b.Id) && a.User.FollowerList.Any(b => MyId == b.Id)) ||
                             (a.User.FollowerList.Any(b => MyId == b.Id) && a.Picture.Privacy != "friends") ||
                             (a.UserId == MyId)) && !listPhoto.Contains(a.PictureId));
                }


                int competionPicCount = 0;

                int size = model.MutualFollowerPictures.Count();
                var data = new ArrayList();
                int k = 0;
                competionPicCount = model.CompetitionPictures.Count();
                for (int i = 0; i < size; i++)
                {
                    data.Add(model.MutualFollowerPictures.Skip(i).First());               
                }


                response.ResponseCode = ResponseCodes.Successful;
                response.Message = "Pictures successfully retrieved";
                response.ResultPayload = new
                {
                    totalmutualFollowerPics,
                    data,
                    data.Count,
                    competionPicCount
                };
                return Ok(response);
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }



        //GET api/images/user/{id}
        [System.Web.Http.Route("user/{userId}/{count}")]
        public IHttpActionResult GetUserPictures(string userId, int count)
        {
            if (count > 0)
            {
                count = count - 1;
            }
            var response = new ApiResponseModel();
            ApplicationUser appUser = _context.Users.FirstOrDefault(w => w.Id == userId);

            try
            {
                if (appUser == null)
                {
                    response.ResponseCode = ResponseCodes.Failed;
                    response.Message = "User not found";
                    return Ok(response);
                }

                var model = new Models.Api.UserPicturesViewModel
                {
                    UserId = userId
                };

                Debug.Assert(appUser != null, "appUser != null");


                int totalpublicandmutualPictures = 0;

                IEnumerable<Picture> publicandmutualPics =
                    appUser.Pictures.Where(w => !w.IsCompeting && !w.IsRemoved)
                        .OrderByDescending(w => w.Uploaded)
                        .Skip(count*10)
                        .Take(10);
                model.PublicAndMutualFollower = publicandmutualPics.Select(MvCtoApiPicture).ToList();
                totalpublicandmutualPictures = (count*10) + model.PublicAndMutualFollower.Count();

                if (!model.PublicAndMutualFollower.Any())
                {
                    totalpublicandmutualPictures = appUser.Pictures.Count(w => !w.IsCompeting && !w.IsRemoved);
                }

                
                response.ResponseCode = ResponseCodes.Successful;
                response.Message = "Pictures successfully retrieved";
                response.ResultPayload = new
                {
                    totalpublicandmutualPictures,
                    model.PublicAndMutualFollower
                };
                return Ok(response);
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }


        [System.Web.Http.Route("interest")]
        public IHttpActionResult GetInterestPictures()
        {
            var response = new ApiResponseModel();

            try
            {
                
                IEnumerable<InterestFeed> interestFeedData = Db.InterestFeeds.ToList();
                
                response.ResponseCode = ResponseCodes.Successful;
                response.Message = "Pictures successfully retrieved";
                response.ResultPayload = new
                {
                    interestFeedData
                };
                return Ok(response);
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
            
        }


        public int GetYear(DateTime presentYear, DateTime uploadYear)
        {
            int result = presentYear.Year - uploadYear.Year;
            return result;
        }


        public int GetMonth(DateTime presentMonth, DateTime uploadedMonth)
        {
            int result = presentMonth.Month - uploadedMonth.Month;

            int calcuResult = Math.Abs(result);

            if (result < 0)
            {
                int month = 12;
                result = month - calcuResult;
                return result;
            }

            return result;
        }


        public int GetDay(DateTime presentDay, DateTime uploadedDay)
        {
            int result = presentDay.Day - uploadedDay.Day;

            int calcuResult = Math.Abs(result);

            if (result < 0)
            {
                if (uploadedDay.Month == 4 || uploadedDay.Month == 6 || uploadedDay.Month == 9 ||
                    uploadedDay.Month == 11)
                {
                    int days = 30;


                    result = days - calcuResult;
                    return result;
                }
                else if (uploadedDay.Month == 1 || uploadedDay.Month == 3 || uploadedDay.Month == 5 ||
                    uploadedDay.Month == 7 || uploadedDay.Month == 8 || uploadedDay.Month == 10 ||
                    uploadedDay.Month == 12)
                {
                    int days = 31;


                    result = days - calcuResult;
                    return result;
                }
                else if (((uploadedDay.Year % 4 == 0) && (uploadedDay.Year % 100 != 0)) || (uploadedDay.Year % 400 == 0) && (uploadedDay.Month == 2))
                {
                    int days = 29;


                    result = days - calcuResult;
                    return result;
                }
                else
                {
                    int days = 28;


                    result = days - calcuResult;
                    return result;
                }

            }

            return result;

        }


        public int GetHours(int presentHour, int uploadedHour)
        {
            int result = presentHour - uploadedHour;
            return result;
        }


        public int GetMinute(int presentMinute, int uploadedMinute)
        {
            int result = presentMinute - uploadedMinute;
            return result;
        }


        public string GetEventTime(DateTime presentDateTime, DateTime uploadedDateTime)
        {

            string demoTime = "updating time..";

            int resultYear = GetYear(presentDateTime, uploadedDateTime);


            if (resultYear > 1)
            {
                if (presentDateTime.Month >= uploadedDateTime.Month)
                {
                    return resultYear + "y";
                }
                else
                {
                    resultYear = resultYear - 1;
                    return resultYear + "y";
                }
            }
            else if (resultYear == 1 && presentDateTime.Month >= uploadedDateTime.Month)
            {
                return "1y";
            }
            else if (resultYear <= 1)
            {
                int resultMonth = GetMonth(presentDateTime, uploadedDateTime);
                if (resultMonth > 1)
                {
                    if (presentDateTime.Day >= uploadedDateTime.Day)
                    {
                        return resultMonth + "mo";
                    }
                    else
                    {
                        resultMonth = resultMonth - 1;
                        return resultMonth + "mo";
                    }
                   
                }
                else if (resultMonth <= 1)
                {

                    int resultDay = GetDay(presentDateTime, uploadedDateTime);
                    if (resultDay == 0 && presentDateTime.Month != uploadedDateTime.Month)
                    {
                        return "1mo";
                    }
                    else if (resultMonth == 1 && presentDateTime.Day >= uploadedDateTime.Day)
                    {
                        return "1mo";
                    }
                    else if (resultDay > 1)
                    {
                        if (resultDay == 7)
                        {
                            if (presentDateTime.Hour >= uploadedDateTime.Hour && presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return "1w";
                            }
                            else
                            {
                                return resultDay + "d";
                            }
                        }
                        else if (resultDay == 14)
                        {
                            if (presentDateTime.Hour >= uploadedDateTime.Hour && presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return "2w";
                            }
                            else
                            {
                                return "1w";
                            }
                        }
                        else if (resultDay == 21)
                        {
                            if (presentDateTime.Hour >= uploadedDateTime.Hour && presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return "3w";
                            }
                            else
                            {
                                return "2w";
                            }
                        }
                        else if (resultDay == 28)
                        {
                            if (presentDateTime.Hour >= uploadedDateTime.Hour && presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return "4w";
                            }
                            else
                            {
                                return "3w";
                            }
                        }
                        else if (resultDay >= 8 && resultDay <= 13)
                        {
                            return "1w";
                        }
                        else if (resultDay >= 15 && resultDay <= 20)
                        {
                            return "2w";
                        }
                        else if (resultDay >= 22 && resultDay <= 27)
                        {
                            return "3w";
                        }
                        else if (resultDay >= 29)
                        {
                            return "4w";
                        }
                        else if (presentDateTime.Hour >= uploadedDateTime.Hour)
                        {
                            return resultDay + "d";
                        }
                        else
                        {
                            resultDay = resultDay - 1;
                            return resultDay + "d";
                        }

                    }
                    else if (resultDay <= 1)
                    {
                        int resultHours = GetHours(presentDateTime.Hour, uploadedDateTime.Hour);
                        if (resultHours == 0 && presentDateTime.Day != uploadedDateTime.Day)
                        {
                            return "1d";
                        }
                        else if (resultDay == 1 && presentDateTime.Hour >= uploadedDateTime.Hour)
                        {
                            return "1d";
                        }
                        else if (resultHours > 1)
                        {
                            if (presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return resultHours + "h";
                            }
                            else
                            {
                                resultHours = resultHours - 1;
                                return resultHours + "h";
                            }                         
                        }
                        else if (resultHours < 0)
                        {
                            int calcuResult = Math.Abs(resultHours);
                            calcuResult = 24 - calcuResult;
                            return calcuResult + "h";
                        }
                        else if (resultHours <= 1)
                        {
                            int resultMinute = GetMinute(presentDateTime.Minute, uploadedDateTime.Minute);
                            int positiveMinute = Math.Abs(resultMinute);

                            if (resultMinute == 0 && presentDateTime.Hour != uploadedDateTime.Hour)
                            {
                                return "1h";
                            }
                            else if (resultHours == 1 && presentDateTime.Minute >= uploadedDateTime.Minute)
                            {
                                return "1h";
                            }
                            else if (resultHours == 1 && positiveMinute < 60)
                            {
                                int calRes = 60 - positiveMinute;
                                return calRes + "m";
                            }
                            else if (resultMinute > 1)
                            {
                                return resultMinute + "m";
                            }
                            else if(resultMinute == 1)
                            {
                                return resultMinute + "m";
                            }
                            else if (resultMinute < 0)
                            {
                                int calcuResult = Math.Abs(resultMinute);
                                calcuResult = 60 - calcuResult;
                                return calcuResult + "m";
                            }
                            else
                            {
                                return "Just now";
                            }
                        }
                    }

                }

            }

            return demoTime;
        }



        public PicturesViewModel MvCtoApiPicture(Activity act)
        {
            ApplicationUser own = Db.Users.Find(User.Identity.GetUserId());

            Picture pic = act.Picture;
     
            DateTime presentDateTime = DateTime.Now;
            DateTime uploadedDateTime = act.Picture.Uploaded;


            string resultOfEventTime = GetEventTime(presentDateTime, uploadedDateTime);

            var notificationSeen = own.Notifications.FirstOrDefault(w => w.Seen == false);
            bool seen;
            if(notificationSeen != null)
            {
                seen = false;
            }
            else
            {
                seen = true;
            }


            var countafterblock = pic.Editpicture.Where(x => !_context.Blocks.Any(w => ((w.BlockedWhomUserId == own.Id && w.BlockedByUserId == x.User_Id) || (w.BlockedWhomUserId == x.User_Id && w.BlockedByUserId == own.Id)) && w.IsBlock));
            var totalafterblockcount = countafterblock.Count();

            string id = pic.User_Id;
            var p = new PicturesViewModel
            {
                Id = pic.Id,
                Uploaded = pic.Uploaded.ToUniversalTime(),
                Privacy = pic.Privacy,
                Description = pic.Description,
                IsCompeting = pic.IsCompeting,
                Isfeatured = pic.IsFrontPanel && pic.IsCompeting,
                PicUrl = pic.Path,
                PicUrlMedium = pic.GetThumb(Sizes.medium),
                PicUrlMini = pic.GetThumb(Sizes.mini),
                PicUrlSmall = pic.GetThumb(Sizes.small),
                StarsCount = pic.TotalStars,
                Poster = new UserInfoViewModel
                {
                    UserId = pic.User_Id,
                    Email = pic.User.Email,
                    Name = pic.User.FullName,
                    ProfilePicURL = pic.User.GetProfilePictureThumb(Sizes.medium),
                    ProfilePicUrlMedium = pic.User.GetProfilePictureThumb(Sizes.big),
                    ProfilePicUrlMini = pic.User.GetProfilePictureThumb(Sizes.big),
                    ProfilePicUrlSmall = pic.User.GetProfilePictureThumb(Sizes.big),
                    IsBrandAmbassador = pic.User.IsBrandAmbassador,
                    IsVerified = pic.User.IsVerified
                },
                Comments = FetchComments(pic),
                Ratings = FetchRatings(pic),
                MyStarCount = pic.GetUserRating(User.Identity.GetUserId()),
                is_mutual = own.FollowerList.Any(b => b.Id == id) && own.FollowingList.Any(c => c.Id == id),
                me_follow = own.FollowingList.Any(a => a.Id == id),
                he_follow = own.FollowerList.Any(a => a.Id == id),
                CommentsCount = pic.Comments.Count,
                EventTime = resultOfEventTime,
                Seen = seen,

                TotalEditPhoto = totalafterblockcount,
                PictureId = pic.Id,
                EditPhotos = { }  };

            return p;
        }


        public WeeklyCompetitonViewModel MvCtoApiPicture(WeeklyCompetitionClient pic)
        {
            ApplicationUser own = Db.Users.Find(User.Identity.GetUserId());
            string id = pic.User_Id;

            var p = new WeeklyCompetitonViewModel
            {
                Id = pic.Id,
                Uploaded = pic.Uploaded.ToUniversalTime(),
                Privacy = "competition",
                Description = pic.Description,
                IsCompeting = true,
                Isfeatured = pic.IsFrontPanel && true,
                PicUrl = pic.Path,
                PicUrlMedium = pic.GetThumb((WeeklyCompetitionClient.Sizes)Sizes.medium),
                PicUrlMini = pic.GetThumb((WeeklyCompetitionClient.Sizes)Sizes.mini),
                PicUrlSmall = pic.GetThumb((WeeklyCompetitionClient.Sizes)Sizes.small),
                StarsCount = pic.TotalStars,
                Poster = new UserInfoViewModel
                {
                    UserId = pic.User_Id,
                    Email = pic.User.Email,
                    Name = pic.User.FullName,
                    ProfilePicURL = pic.User.GetProfilePictureThumb(Sizes.medium),
                    ProfilePicUrlMedium = pic.User.GetProfilePictureThumb(Sizes.medium),
                    ProfilePicUrlMini = pic.User.GetProfilePictureThumb(Sizes.mini),
                    ProfilePicUrlSmall = pic.User.GetProfilePictureThumb(Sizes.small),
                    IsBrandAmbassador = pic.User.IsBrandAmbassador,
                    IsVerified = pic.User.IsVerified
                },
                PictureId = 81,
                WeeklyRatings = FetchWeeklyRatings(pic),
                MyStarCount = pic.GetUserRating(User.Identity.GetUserId()),
                is_mutual = own.FollowerList.Any(b => b.Id == id) && own.FollowingList.Any(c => c.Id == id),
                me_follow = own.FollowingList.Any(a => a.Id == id),
                he_follow = own.FollowerList.Any(a => a.Id == id),
                Keyword = pic.Keywords,
                TotalEditPhoto = 0,
                EditPhotos = { },      
            };

            return p;
        }


        public PicturesViewModel MvCtoApiPicture(Picture pic)
        {
            ApplicationUser own = Db.Users.Find(User.Identity.GetUserId());
            string id = pic.User_Id;

            var countafterblock = pic.Editpicture.Where(x => !_context.Blocks.Any(w => ((w.BlockedWhomUserId == own.Id && w.BlockedByUserId == x.User_Id) || (w.BlockedWhomUserId == x.User_Id && w.BlockedByUserId == own.Id)) && w.IsBlock));
            var totalafterblockcount = countafterblock.Count();


            var p = new PicturesViewModel
            {
                Id = pic.Id,
                PictureId = pic.Id,
                Uploaded = pic.Uploaded.ToUniversalTime(),
                Privacy = pic.Privacy,
                Description = pic.Description,
                IsCompeting = pic.IsCompeting,
                Isfeatured = pic.IsFrontPanel && pic.IsCompeting,
                PicUrl = pic.Path,
                PicUrlMedium = pic.GetThumb(Sizes.medium),
                PicUrlMini = pic.GetThumb(Sizes.mini),
                PicUrlSmall = pic.GetThumb(Sizes.small),
                StarsCount = pic.TotalStars,
                Poster = new UserInfoViewModel
                {
                    UserId = pic.User_Id,
                    Email = pic.User.Email,
                    Name = pic.User.FullName,
                    ProfilePicURL = pic.User.GetProfilePictureThumb(Sizes.medium),
                    ProfilePicUrlMedium = pic.User.GetProfilePictureThumb(Sizes.medium),
                    ProfilePicUrlMini = pic.User.GetProfilePictureThumb(Sizes.mini),
                    ProfilePicUrlSmall = pic.User.GetProfilePictureThumb(Sizes.small),
                    IsBrandAmbassador = pic.User.IsBrandAmbassador,
                    IsVerified = pic.User.IsVerified
                },
                Comments = FetchComments(pic),
                Ratings = FetchRatings(pic),
                MyStarCount = pic.GetUserRating(User.Identity.GetUserId()),
                is_mutual = own.FollowerList.Any(b => b.Id == id) && own.FollowingList.Any(c => c.Id == id),
                me_follow = own.FollowingList.Any(a => a.Id == id),
                he_follow = own.FollowerList.Any(a => a.Id == id),
                Keyword = pic.Keywords,
                TotalEditPhoto = totalafterblockcount,
                CommentsCount = pic.Comments.Count,
                EditPhotos = pic.Editpicture.Select(it => new
                {
                    it.Id,
                    UserId = it.User_Id,
                    it.Uploaded,
                    Username = it.User.Name,
                    GetProfilePictureThumb = it.User.GetProfilePictureThumb(Sizes.big),
                    EditPicUrl = it.Path,
                    LikesCount = it.TotalLikes,
                    DisLikesCount = it.TotalDislikes,
                    MyLikesCount = it.GetUserLike(User.Identity.GetUserId()),
                    MyDislikesCount = it.GetUserDisLike(User.Identity.GetUserId()),
                    TotalEditPhoto = totalafterblockcount
                }).Where(x => !_context.Blocks.Any(w => ((w.BlockedWhomUserId == own.Id && w.BlockedByUserId == x.UserId) || (w.BlockedWhomUserId == x.UserId && w.BlockedByUserId == own.Id)) && w.IsBlock)).OrderByDescending(q => q.Uploaded).Take(3)
            };

            return p;
        }

    }                
    
}