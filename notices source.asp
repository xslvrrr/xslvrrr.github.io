
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html>
<head>
<title>Millennium Student & Parent Portal</title>
<LINK media=screen href="/includes/reports.css" type=text/css rel=stylesheet>
<LINK href="/includes/smoothness/jquery-ui-1.10.3.custom.min.css" type=text/css rel=stylesheet>
<LINK href="/includes/plugins236.css" type=text/css rel=stylesheet>
<script type="text/javascript" src="/includes/jquery-1.10.2.min.js"></script>
<script type="text/javascript" src="/includes/jquery-ui-1.10.3.custom.min.js"></script>
<script type="text/javascript" src="/includes/plugins236.js"></script>
<script>
$(function() {
	$('*[title]').hover(function()
	{
		this.txt = this.title
		this.title = '';
		this.txt.replace("\n","<br>");
		$("#helper").html(this.txt);
		if (this.txt.length > 1) $("#helper").show();
	}, function() {
		this.title = this.txt;
		$("#helper").hide();
		
	});
	$("#helper").hide();
	$("#year").change( function()
	{
		var yr = this.value;
		$.ajax({ type: "GET", url: "/portal/_settings.asp", data: { year: yr }	})
		 .done(function( msg ) { location.href = location.href; });
	});
} );
</script>
</head>
<body topmargin=0 leftmargin=0 rightmargin=0 bgcolor="#70A080">
<div id="helper"></div>
<div id="root">

<div id="white"><a href="/portal/"><img src="/images/logo_mil3.gif" vspace=4 hspace=10 border=0></a></div> 
<div id="topdate">7 SEP 2025 23:07</div>
<TABLE cellSpacing=0 cellPadding=0 width=100% height=300 border=0 bgColor="#70A080"><!-- top blue bar -->
  <TR valign=top>
	<TD width=140 bgcolor="#70A080"><BR>

	<DIV class="nav">
	<div class="nav1">
	<a href="/portal/">Home</a><BR>
	<a href="/portal/modify.asp">My Account</a><BR>
	<a href="/portal/logout.asp">Log Out</a>
	</div><BR>
<div class='nav4'><a href="/portal/article.asp">Resources</a><BR><a href="/portal/notices.asp">Notices</a><BR></div><BR><div class='nav5'><a href="/portal/calendar.asp?uid=424840">Calendar</a><BR><a href="http://www.millenniumschools.net.au/rhhs/" target="_blank">Website</a><BR></div><BR><BR><div class='nav2'><a href='/portal/classes.asp?uid=424840'>Classes</a><BR><a href="/portal/scopes.asp?uid=424840">Lessons</a><BR><a href='/portal/timetable.asp?uid=424840'>Timetable</a><BR><a href='/portal/diary.asp?uid=424840'>Diary</a><BR></div><BR><div class='nav3'><a href='/portal/activities.asp?uid=424840'>Markbook</a><BR><a href='/portal/reports.asp?uid=424840'>Reports</a><BR></div><br><div class='nav5'><a href='/portal/register.asp?uid=424840'>Register</a><BR><a href='/portal/attendance.asp?uid=424840'>Attendance</a><BR></div><BR>

	<BR>
	</div>
	
</td>
<td bgcolor="#508060" width=5><img src="/images/dot_g.gif" width=5 height=10></td>
<td bgcolor="#ffffff">
<table class='grey' width=98% height=24 align=center cellspacing=0><tr valign=bottom><td><B>Rouse Hill High School : Ryan Khan</td><td align=right><span class="padding-bottom:4px;">Year: </span><select name='year' id='year'><option value=2024>2024<option value=2025 SELECTED>2025<option value=2026>2026</select></td></tr></table>
<div class="margin">
<div class="content">
<!--Main Body-->

<style> H4 {margin:0 0 10px 0;} .notice {margin:0 0 10px 10px; } </style><div class='contentTitle'>STUDENT NOTICES : &nbsp; &nbsp; [ Monday, 8 September 2025 ]</div><BR><form action="notices.asp" name="frm" method=get class="content"><input type="hidden" name="day" value="8"><table  ><tr valign=top><td width=260><div><a href="?date=8 AUG 2025"><< </a> <select name="month" onChange="frm.submit();"><option value=1> January<option value=2> February<option value=3> March<option value=4> April<option value=5> May<option value=6> June<option value=7> July<option value=8> August<option value=9 SELECTED>> September<option value=10> October<option value=11> November<option value=12> December</select> <select name="year" onChange="frm.submit();"><option value=2023> 2023<option value=2024> 2024<option value=2025 SELECTED>> 2025<option value=2026> 2026<option value=2027> 2027</select> <a href="?date=8 OCT 2025"> >></a><BR><BR><table class="contentSM" width=240 id="calendar" bgcolor=white><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr><tr align=center bgcolor='fafafa'><td><u><B><a href='?date=1 Sep 2025'>1</a></td><td><u><B><a href='?date=2 Sep 2025'>2</a></td><td><u><B><a href='?date=3 Sep 2025'>3</a></td><td><u><B><a href='?date=4 Sep 2025'>4</a></td><td><u><B><a href='?date=5 Sep 2025'>5</a></td><td bgcolor='#f0f0f0'><a href='?date=6 Sep 2025'>6</a></td><td bgcolor='#f0f0f0'><a href='?date=7 Sep 2025'>7</a></td></tr><tr align=center bgcolor='fafafa'><td bgcolor='#f0e0e0'><u><B><a href='?date=8 Sep 2025'>8</a></td><td><u><B><a href='?date=9 Sep 2025'>9</a></td><td><u><B><a href='?date=10 Sep 2025'>10</a></td><td><u><B><a href='?date=11 Sep 2025'>11</a></td><td><u><B><a href='?date=12 Sep 2025'>12</a></td><td bgcolor='#f0f0f0'><a href='?date=13 Sep 2025'>13</a></td><td bgcolor='#f0f0f0'><a href='?date=14 Sep 2025'>14</a></td></tr><tr align=center bgcolor='fafafa'><td><u><B><a href='?date=15 Sep 2025'>15</a></td><td><u><B><a href='?date=16 Sep 2025'>16</a></td><td><u><B><a href='?date=17 Sep 2025'>17</a></td><td><u><B><a href='?date=18 Sep 2025'>18</a></td><td><u><B><a href='?date=19 Sep 2025'>19</a></td><td bgcolor='#f0f0f0'><a href='?date=20 Sep 2025'>20</a></td><td bgcolor='#f0f0f0'><a href='?date=21 Sep 2025'>21</a></td></tr><tr align=center bgcolor='fafafa'><td><u><B><a href='?date=22 Sep 2025'>22</a></td><td><u><B><a href='?date=23 Sep 2025'>23</a></td><td><u><B><a href='?date=24 Sep 2025'>24</a></td><td><u><B><a href='?date=25 Sep 2025'>25</a></td><td><u><B><a href='?date=26 Sep 2025'>26</a></td><td bgcolor='#f0f0f0'><a href='?date=27 Sep 2025'>27</a></td><td bgcolor='#f0f0f0'><a href='?date=28 Sep 2025'>28</a></td></tr><tr align=center bgcolor='fafafa'><td><a href='?date=29 Sep 2025'>29</a></td><td><a href='?date=30 Sep 2025'>30</a></td><td></td><td></td><td></td><td bgcolor='#f0f0f0'></td><td bgcolor='#f0f0f0'></td></tr></table> &nbsp; <small><U><B>Underline</B></U> = Student Notices<BR></small></td><td><h4>&#127775; Pulse Alive 2026 &#127775;</h4><div class="notice"><p>Students are invited to take part in Pulse Alive 2026, a performing arts festival event held at Sydney Olympic Park in March next year. This is a great opportunity to work with students from other schools and perform as part of a massed dance ensemble or the First Nations Dance Ensemble.</p><p>&nbsp;</p><p>Key Info:</p><ul><li>Rehearsal in <b>Week 5, Term 2(2026)</b></li><li>Performance in <b>Week 8, Term 1 (2026)</b></li><li>Exact dates/times will be confirmed in Term 4, 2025 after school nominations</li></ul>If you are interested in, please put your name on the sign-up sheet outside Staffroom 1. <b>Sign-up closes Friday 26th September (end of Term 3).</b><p>&nbsp;</p></div><h4>&#127775; Pulse Alive Dance Company &#127775;</h4><div class="notice"><p><span style="color: #800080;"><i><b>The Pulse Alive team are seeking talented dancers to be part of the Pulse Alive Dance Company for 2026!</b></i></span></p><p>&nbsp;</p><p>&nbsp;- This category is only open to individual performers. Students selected as principal dancers will not be able to participate with their school group in massed dance or First Nations dance ensemble.</p><p>&nbsp;- As part of the selection process, students will need to attend a live audition, held on <b>Sunday 12th October, 2025 (School Holidays)</b>&nbsp;at The Arts Unit, Lewisham.</p><p>&nbsp;- Successful students will require the endorsement of their school principal to participate.</p><p>&nbsp;- Students selected as members of he Pulse Alive Dance Company must be available for all rehearsal and performance dates.</p><p><br /></p><p><b><u><span style="color: #800080;">Students who wish to participate must complete the nomination form by </span><span style="color: #800080;">Monday 22nd September (Term 3, Week 10).</span></u></b></p><p>&nbsp;</p><p>&nbsp;For more information, please see Miss McMillan in Staffroom 1.</p></div><h4>Attendance and Uniform</h4><div class="notice"><p>This is a reminder that the school day starts at 8:45am. You are required to be in classrooms by this time. <b>From 8:50am teachers will be sending you to the office to sign in LATE and further consequences for late arrival may apply without a valid reason for leave or late arrival.</b></p><p>Students are <b>not</b>&nbsp;to wear hoodies or tracksuit pants to school.&nbsp;Non-uniform items will be signed into the office. Repeated uniform issues will result in more severe consequences.</p></div><h4>Build Clubs at RHHS</h4><div class="notice"><p data-start="107" data-end="226"><b data-start="107" data-end="224">Got an interest you&#8217;re passionate about? Think others might share it? Want a space to bring it to life? So do we!</b></p>
<p data-start="228" data-end="456">We&#8217;re inviting <i data-start="243" data-end="248">you</i> to suggest a club at RHHS! No idea is too big or small, too serious or silly. Whether it&#8217;s sport, academics, pop culture, creative arts, competitions, or something entirely unique &#8212; we want to hear from you.</p>
<p data-start="458" data-end="520">Fill out the form to propose your club idea and <u>take the lead!</u></p><p>&nbsp;</p><p>https://forms.gle/x15Lv1rFbLqvWhz18&nbsp;</p><p>&nbsp;</p>
<p data-start="522" data-end="639"><b data-start="522" data-end="563">Worried about finding people to join?</b><br data-start="563" data-end="566" />
The Leadership Team is here to help promote your club and build interest.</p>
<p data-start="641" data-end="764"><b data-start="641" data-end="655">Important:</b><br data-start="655" data-end="658" />
You <b data-start="662" data-end="670">must</b> have a teacher willing to supervise your club during lunch or recess in your chosen location.</p>
<p data-start="766" data-end="791">&#8211; <i data-start="768" data-end="789">The Leadership Team</i></p></div><h4>Join Peer Tutoring</h4><div class="notice"><p data-start="0" data-end="40">&#128218;&nbsp;<b data-start="3" data-end="35">Join Peer Tutoring &#8211; Term 3!</b>&nbsp;&#128218;</p><p data-start="42" data-end="178">Need help with your studies or keen to support others?&nbsp;<b data-start="97" data-end="114">Peer Tutoring</b>&nbsp;is running every&nbsp;<b data-start="132" data-end="165">Wednesday at recess and lunch</b>&nbsp;in Term 3!</p><p data-start="180" data-end="308">&#128313;&nbsp;<b data-start="183" data-end="191">Who?</b>&nbsp;Open to all students in&nbsp;<b data-start="216" data-end="230">Years 7-12</b><br data-start="230" data-end="233" />&#128313;&nbsp;<b data-start="236" data-end="245">When?</b>&nbsp;Wednesdays at&nbsp;<b data-start="260" data-end="278">recess &amp; lunch</b><br data-start="278" data-end="281" />&#128313;&nbsp;<b data-start="284" data-end="294">Where?</b>&nbsp;<b data-start="295" data-end="306">Library</b></p><p data-start="310" data-end="448">Whether you&#8217;re looking to&nbsp;<b data-start="336" data-end="408">boost your confidence, improve your skills, or help a fellow student</b>, this is a great way to get involved!</p><p data-start="450" data-end="551">&#128204;&nbsp;<b data-start="453" data-end="511">Sign up now using the Google Form or scan the QR code!</b>&nbsp;See Prefect Omar for details. &#9999;&#65039;&#128214;</p><p>https://docs.google.com/forms/d/1inH2CShVSEWjkE4S4haEktXiapPJ2aFGdaVUJDSUH4g/viewform?edit_requested=true<br /></p></div><h4>Lower F Block Re-Rooming - Monday 8th September</h4><div class="notice"><p>&nbsp;Lower F Block will be re-roomed for a HSC Examination. Re-rooming information is below:&nbsp;</p><p><google-sheets-html-origin><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1" data-sheets-baot="1"><colgroup><col width="192"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"><col width="173"></colgroup>
<tr>
<td rowspan="1" colspan="13">F Block Re-Rooming</td>
</tr><tr>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
</tr><tr>
<td rowspan="1" colspan="13">MONDAY 8th SEPTEMBER</td>
</tr><tr>
<td></td>
<td></td>
<td>PERIOD 1</td>
<td>PERIOD 2</td>
<td>RECESS</td>
<td>PERIOD 3</td>
<td>PERIOD 4</td>
<td>PERIOD 5</td>
<td>LUNCH</td>
<td>PERIOD 6</td>
<td>PERIOD 7</td>
<td>PERIOD 8</td>
<td>AFTER SCHOOL</td>
</tr><tr>
<td>C28</td>
<td></td>
<td></td>
<td></td>
<td></td>
<td>8VAR.3 [Q1]</td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
</tr><tr>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td>Q1</td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
<td></td>
</tr><tr>
<td>F4</td>
<td></td>
<td>8MUS.O [D113]</td>
<td>8MUS.O [D113]</td>
<td></td>
<td>8MUS.L [C28]</td>
<td>8MUS.L [C28]</td>
<td>8MUS.L [C28]</td>
<td></td>
<td>8MUS.T [D110]</td>
<td>8MUS.K [F7]</td>
<td>8MUS.K [F7]</td>
<td></td>
</tr><tr>
<td></td>
<td></td>
<td>D113</td>
<td>D113</td>
<td></td>
<td>C28</td>
<td>C28</td>
<td>C28</td>
<td></td>
<td>D110</td>
<td>F7</td>
<td>F7</td>
<td></td>
</tr><tr>
<td>F6</td>
<td></td>
<td>9MUS2.X [F109]</td>
<td>9MUS2.X [F109]</td>
<td></td>
<td>8MUS.N [D104]</td>
<td>10MUS.Z [D12]</td>
<td>10MUS.Z [D12]</td>
<td></td>
<td>7SWI.L [L3]</td>
<td>7SWI.L [L3]</td>
<td></td>
<td></td>
</tr><tr>
<td></td>
<td></td>
<td>F109</td>
<td>F109</td>
<td></td>
<td>D104</td>
<td>D12</td>
<td>D12</td>
<td></td>
<td>L3</td>
<td>L3</td>
<td></td>
<td></td>
</tr></table></google-sheets-html-origin></p><google-sheets-html-origin>
</google-sheets-html-origin></div><h4>RHHS Gardening Club</h4><div class="notice">&#127811;&#127827;&#129723;Are you interested in gardening veggies, fruits, flowers or herbs? Want to enjoy a calm recess surrounded by nature? Please join our Gardening Club run by Year 8&#8217;s!! Meeting times are Year 7, 8, 11 and 12&#8217;s Recess on Monday&#8217;s (Period 3a, Week A), and Year 7, 8, 11 and 12&#8217;s recess on Thursday(Period 3a, Week B). Days and time will change after next term. Can&#8217;t wait to see you in the garden!!&nbsp;&#127799;&#129365;&#127807;</div><h4>Year 7 & 8 China Club</h4><div class="notice"><p>Calling all year 7 students who are interested in joining China Club!</p><p>&nbsp;</p><p>We will hold a meeting on Monday 8 Sept at recess in room Q1.</p><p>Come along to join in this club and discuss what Chinese cultural projects you would like to undertake as a group.&nbsp;</p></div></td></tr></table><style>#calendar U A { text-decoration:underline } </style>
<BR></div></div></td></tr>
<tr><td bgColor="#70A080"></td><td colspan=2 height=5 bgcolor="#508060"></td></tr></table><BR>
<div id="student" title="Student Details"></div>
<div id="school" title="School Details"></div>
<center><div class="footer">Copyright © Millennium Schools Pty Ltd. All rights reserved. Authorised use only.<BR>
[ 0.171875 seconds ]</div></body></html>