const base = "https://www.rustenburgtoday.co.za";
const signin = await (await fetch(`${base}/en/auth/sign-in`)).text();
const signup = await (await fetch(`${base}/en/auth/sign-up`)).text();
const forgot = await (await fetch(`${base}/en/auth/forgot`)).text();
const tv = await fetch(`${base}/en/department/tv`, { redirect: "manual" });
const robots = await (await fetch(`${base}/robots.txt`)).text();
const out = {
  googleMissingShown: /google/i.test(signin) && /not configured|missing/i.test(signin),
  facebookMissingShown: /facebook/i.test(signin) && /not configured|missing/i.test(signin),
  signupForm: /name="email"/i.test(signup) && /name="password"/i.test(signup),
  forgotForm: /name="email"/i.test(forgot),
  tvAnonStatus: tv.status,
  robotsDisallowAdmin: /Disallow:\s*\/admin/i.test(robots),
  robotsDisallowDepartment: /Disallow:\s*\/department/i.test(robots),
};
console.log(JSON.stringify(out, null, 2));
