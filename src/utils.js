import axios from "axios";
export function randId() {
  return Math.random()
    .toString(36)
    .substr(2, 10);
}

export class ZenodoClient {
  constructor(clientId, useSandbox) {
    this.clientId = clientId;
    this.callbackUrl = encodeURIComponent("https://imjoy.io/login-helper");
    this.credential = null;
    if (useSandbox === undefined) useSandbox = true;
    this.useSandbox = useSandbox;
  }
  login() {
    return new Promise((resolve, reject) => {
      const loginWindow = window.open(
        `https://${
          this.useSandbox ? "sandbox." : ""
        }zenodo.org/oauth/authorize?scope=deposit%3Awrite+deposit%3Aactions&state=CHANGEME&redirect_uri=${
          this.callbackUrl
        }&response_type=token&client_id=${this.clientId}`,
        "Login"
      );
      const timer = setTimeout(() => {
        loginWindow.close();
        // make sure we closed the window
        reject("Timeout error");
      }, 20000);
      const handleLogin = event => {
        if (loginWindow === event.source) {
          // run only once
          window.removeEventListener("message", handleLogin);
          loginWindow.close();
          clearTimeout(timer);
          if (event.data.error) {
            // make sure we closed the window
            setTimeout(() => {
              reject(event.data.error);
            }, 1);
            return;
          }
          console.log("Successfully logged in", event.data);
          this.credential = event.data;
          resolve(event.data);
        }
      };
      window.addEventListener("message", handleLogin, false);
    });
  }

  async createDeposition() {
    let response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions?access_token=${
        this.credential.access_token
      }`
    );
    console.log(await response.json());
    const headers = { "Content-Type": "application/json" };
    // create an empty deposition
    response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions?access_token=${
        this.credential.access_token
      }`,
      { method: "POST", body: JSON.stringify({}), headers }
    );
    const depositionInfo = await response.json();
    return depositionInfo;
  }

  async retrieve(depositionInfo) {
    const depositionId =
      typeof depositionInfo === "string" ? depositionInfo : depositionInfo.id;
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}?access_token=${
        this.credential.access_token
      }`,
      { method: "GET" }
    );
    return await response.json();
  }

  async edit(depositionInfo) {
    const depositionId =
      typeof depositionInfo === "string" ? depositionInfo : depositionInfo.id;
    const headers = { "Content-Type": "application/json" };
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}/actions/edit?access_token=${
        this.credential.access_token
      }`,
      { method: "POST", body: JSON.stringify({}), headers }
    );
    return await response.json();
  }

  async discard(depositionInfo) {
    const depositionId =
      typeof depositionInfo === "string" ? depositionInfo : depositionInfo.id;
    const headers = { "Content-Type": "application/json" };
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}/actions/discard?access_token=${
        this.credential.access_token
      }`,
      { method: "POST", body: JSON.stringify({}), headers }
    );
    return await response.json();
  }

  async createNewVersion(depositionInfo) {
    const depositionId =
      typeof depositionInfo === "string" ? depositionInfo : depositionInfo.id;
    const headers = { "Content-Type": "application/json" };
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}/actions/newversion?access_token=${
        this.credential.access_token
      }`,
      { method: "POST", body: JSON.stringify({}), headers }
    );
    return await response.json();
  }

  async updateMetadata(depositionInfo, metadata) {
    const depositionId =
      typeof depositionInfo === "string" ? depositionInfo : depositionInfo.id;
    const headers = { "Content-Type": "application/json" };
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}?access_token=${
        this.credential.access_token
      }`,
      { method: "PUT", body: JSON.stringify({ metadata }), headers }
    );
    if (response.ok) return await response.json();
    else {
      const details = await response.json();
      throw new Error(
        "Failed to update metadata, error: " + JSON.stringify(details.errors)
      );
    }
  }

  async uploadFile(depositionInfo, file, progressCallback) {
    const bucketUrl = depositionInfo.links.bucket;
    const fileName = file.name;
    const url = `${bucketUrl}/${fileName}?access_token=${this.credential.access_token}`;
    if (typeof axios === "undefined") {
      if (progressCallback) progressCallback(0);
      const response = await fetch(url, {
        method: "PUT",
        body: file
      });
      if (progressCallback) progressCallback(file.size);
      return await response.json();
    } else {
      const options = {
        headers: { "Content-Type": file.type },
        onUploadProgress: progressEvent => {
          if (progressCallback) progressCallback(progressEvent.loaded);
          else {
            const progress = Math.round(
              ((1.0 * progressEvent.loaded) / file.size) * 100.0
            );
            console.log(
              "uploading annotation, size: " +
                Math.round(progressEvent.loaded / 1000000) +
                "MB, " +
                progress +
                "% uploaded."
            );
          }
        }
      };
      const response = await axios.put(url, file, options);
      return response.data;
    }
  }

  async publish(depositionInfo) {
    const depositionId =
      typeof depositionInfo === "number" ? depositionInfo : depositionInfo.id;
    const headers = { "Content-Type": "application/json" };
    const response = await fetch(
      `https://${
        this.useSandbox ? "sandbox." : ""
      }zenodo.org/api/deposit/depositions/${depositionId}/actions/publish?access_token=${
        this.credential.access_token
      }`,
      { method: "POST", body: JSON.stringify({}), headers }
    );
    if (response.ok) {
      const result = await response.json();
      if (result.submitted && result.doi_url) {
        return result;
      } else {
        throw new Error("Failed to publish, error: " + JSON.stringify(result));
      }
    } else {
      const details = await response.json();
      throw new Error(
        "Failed to publish, error: " + JSON.stringify(details.errors)
      );
    }
  }
}

export const anonymousAnimals = [
  "Duck",
  "Rabbit",
  "Ifrit",
  "Ibex",
  "Turtle",
  "Leopard",
  "Gopher",
  "Ferret",
  "Beaver",
  "Chinchilla",
  "Auroch",
  "Dingo",
  "Kraken",
  "Rhino",
  "Python",
  "Cormorant",
  "Platypus",
  "Elephant",
  "Jackal",
  "Dolphin",
  "Capybara",
  "Camel",
  "Chupacabra",
  "Tiger",
  "Kangaroo",
  "Armadillo",
  "Sheep",
  "Panda",
  "Hippo",
  "Cheetah",
  "Manatee",
  "Raccoon",
  "Wombat",
  "Dinosaur",
  "Hyena",
  "Crow",
  "Orangutan",
  "Wolf",
  "Chameleon",
  "Shrew",
  "Penguin",
  "Nyan Cat",
  "Liger",
  "Quagga",
  "Squirrel",
  "Wolverine",
  "Axolotl",
  "Anteater",
  "Frog",
  "Narwhal",
  "Mink",
  "Chipmunk",
  "Buffalo",
  "Monkey",
  "Bat",
  "Giraffe",
  "Iguana",
  "Fox",
  "Coyote",
  "Moose",
  "Otter",
  "Grizzly",
  "Koala",
  "Alligator",
  "Pumpkin",
  "Llama",
  "Badger",
  "Walrus",
  "Skunk",
  "Lemur",
  "Hedgehog"
];

export function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this,
      args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

export function concatAndResolveUrl(url, concat) {
  const url1 = url.split("/");
  const url2 = concat.split("/");
  const url3 = [];
  for (let i = 0, l = url1.length; i < l; i++) {
    if (url1[i] == "..") {
      url3.pop();
    } else if (url1[i] == ".") {
      continue;
    } else {
      url3.push(url1[i]);
    }
  }
  for (let i = 0, l = url2.length; i < l; i++) {
    if (url2[i] == "..") {
      url3.pop();
    } else if (url2[i] == ".") {
      continue;
    } else {
      url3.push(url2[i]);
    }
  }
  return url3.join("/");
}

function rel2abs(url, base_url) {
  /* Only accept commonly trusted protocols:
   * Only data-image URLs are accepted, Exotic flavours (escaped slash,
   * html-entitied characters) are not supported to keep the function fast */
  if (
    /^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(url)
  )
    return url; //Url is already absolute
  if (url.substring(0, 2) == "//") return location.protocol + url;
  else if (url.charAt(0) == "/") return base_url + url.slice(1);
  else if (/^\s*$/.test(url)) return ""; //Empty = Return nothing

  url = base_url + url;
  while (/\/\.\.\//.test((url = url.replace(/[^/]+\/+\.\.\//g, ""))));

  /* Escape certain characters to prevent XSS */
  url = url
    .replace(/\.$/, "")
    .replace(/\/\./g, "")
    .replace(/"/g, "%22")
    .replace(/'/g, "%27")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return url;
}

export function replaceAllRelByAbs(html, base_url) {
  /*HTML/XML Attribute may not be prefixed by these characters (common 
     attribute chars.  This list is not complete, but will be sufficient
     for this function (see http://www.w3.org/TR/REC-xml/#NT-NameChar). */
  var att = "[^-a-z0-9:._]";
  if (!base_url.endsWith("/")) base_url = base_url + "/";

  var entityEnd = "(?:;|(?!\\d))";
  var ents = {
    " ": "(?:\\s|&nbsp;?|&#0*32" + entityEnd + "|&#x0*20" + entityEnd + ")",
    "(": "(?:\\(|&#0*40" + entityEnd + "|&#x0*28" + entityEnd + ")",
    ")": "(?:\\)|&#0*41" + entityEnd + "|&#x0*29" + entityEnd + ")",
    ".": "(?:\\.|&#0*46" + entityEnd + "|&#x0*2e" + entityEnd + ")"
  };
  /* Placeholders to filter obfuscations */
  var charMap = {};
  var s = ents[" "] + "*"; //Short-hand for common use
  var any = "(?:[^>\"']*(?:\"[^\"]*\"|'[^']*'))*?[^>]*";
  /* ^ Important: Must be pre- and postfixed by < and >.
   *   This RE should match anything within a tag!  */

  /*
    @name ae
    @description  Converts a given string in a sequence of the original
                    input and the HTML entity
    @param String string  String to convert
    */
  function ae(string) {
    var all_chars_lowercase = string.toLowerCase();
    if (ents[string]) return ents[string];
    var all_chars_uppercase = string.toUpperCase();
    var RE_res = "";
    for (var i = 0; i < string.length; i++) {
      var char_lowercase = all_chars_lowercase.charAt(i);
      if (charMap[char_lowercase]) {
        RE_res += charMap[char_lowercase];
        continue;
      }
      var char_uppercase = all_chars_uppercase.charAt(i);
      var RE_sub = [char_lowercase];
      RE_sub.push("&#0*" + char_lowercase.charCodeAt(0) + entityEnd);
      RE_sub.push(
        "&#x0*" + char_lowercase.charCodeAt(0).toString(16) + entityEnd
      );
      if (char_lowercase != char_uppercase) {
        /* Note: RE ignorecase flag has already been activated */
        RE_sub.push("&#0*" + char_uppercase.charCodeAt(0) + entityEnd);
        RE_sub.push(
          "&#x0*" + char_uppercase.charCodeAt(0).toString(16) + entityEnd
        );
      }
      RE_sub = "(?:" + RE_sub.join("|") + ")";
      RE_res += charMap[char_lowercase] = RE_sub;
    }
    return (ents[string] = RE_res);
  }

  /*
    @name by
    @description  2nd argument for replace().
    */
  function by(match, group1, group2, group3) {
    /* Note that this function can also be used to remove links:
     * return group1 + "javascript://" + group3; */
    return group1 + rel2abs(group2, base_url) + group3;
  }
  /*
    @name by2
    @description  2nd argument for replace(). Parses relevant HTML entities
    */
  var slashRE = new RegExp(ae("/"), "g");
  var dotRE = new RegExp(ae("."), "g");
  function by2(match, group1, group2, group3) {
    /*Note that this function can also be used to remove links:
     * return group1 + "javascript://" + group3; */
    group2 = group2.replace(slashRE, "/").replace(dotRE, ".");
    return group1 + rel2abs(group2, base_url) + group3;
  }
  /*
    @name cr
    @description            Selects a HTML element and performs a
                              search-and-replace on attributes
    @param String selector  HTML substring to match
    @param String attribute RegExp-escaped; HTML element attribute to match
    @param String marker    Optional RegExp-escaped; marks the prefix
    @param String delimiter Optional RegExp escaped; non-quote delimiters
    @param String end       Optional RegExp-escaped; forces the match to end
                            before an occurence of <end>
   */
  function cr(selector, attribute, marker, delimiter, end) {
    if (typeof selector == "string") selector = new RegExp(selector, "gi");
    attribute = att + attribute;
    marker = typeof marker == "string" ? marker : "\\s*=\\s*";
    delimiter = typeof delimiter == "string" ? delimiter : "";
    end = typeof end == "string" ? "?)(" + end : ")(";
    var re1 = new RegExp(
      "(" + attribute + marker + '")([^"' + delimiter + "]+" + end + ")",
      "gi"
    );
    var re2 = new RegExp(
      "(" + attribute + marker + "')([^'" + delimiter + "]+" + end + ")",
      "gi"
    );
    var re3 = new RegExp(
      "(" +
        attribute +
        marker +
        ")([^\"'][^\\s>" +
        delimiter +
        "]*" +
        end +
        ")",
      "gi"
    );
    html = html.replace(selector, function(match) {
      return match
        .replace(re1, by)
        .replace(re2, by)
        .replace(re3, by);
    });
  }
  /* 
    @name cri
    @description            Selects an attribute of a HTML element, and
                              performs a search-and-replace on certain values
    @param String selector  HTML element to match
    @param String attribute RegExp-escaped; HTML element attribute to match
    @param String front     RegExp-escaped; attribute value, prefix to match
    @param String flags     Optional RegExp flags, default "gi"
    @param String delimiter Optional RegExp-escaped; non-quote delimiters
    @param String end       Optional RegExp-escaped; forces the match to end
                              before an occurence of <end>
   */
  function cri(selector, attribute, front, flags, delimiter, end) {
    if (typeof selector == "string") selector = new RegExp(selector, "gi");
    attribute = att + attribute;
    flags = typeof flags == "string" ? flags : "gi";
    var re1 = new RegExp("(" + attribute + '\\s*=\\s*")([^"]*)', "gi");
    var re2 = new RegExp("(" + attribute + "\\s*=\\s*')([^']+)", "gi");
    var at1 = new RegExp("(" + front + ')([^"]+)(")', flags);
    var at2 = new RegExp("(" + front + ")([^']+)(')", flags);
    let handleAttr;
    if (typeof delimiter == "string") {
      end = typeof end == "string" ? end : "";
      var at3 = new RegExp(
        "(" +
          front +
          ")([^\"'][^" +
          delimiter +
          "]*" +
          (end ? "?)(" + end + ")" : ")()"),
        flags
      );
      handleAttr = function(match, g1, g2) {
        return (
          g1 +
          g2
            .replace(at1, by2)
            .replace(at2, by2)
            .replace(at3, by2)
        );
      };
    } else {
      handleAttr = function(match, g1, g2) {
        return g1 + g2.replace(at1, by2).replace(at2, by2);
      };
    }
    html = html.replace(selector, function(match) {
      return match.replace(re1, handleAttr).replace(re2, handleAttr);
    });
  }

  /* <meta http-equiv=refresh content="  ; url= " > */
  cri(
    "<meta" +
      any +
      att +
      'http-equiv\\s*=\\s*(?:"' +
      ae("refresh") +
      '"' +
      any +
      ">|'" +
      ae("refresh") +
      "'" +
      any +
      ">|" +
      ae("refresh") +
      "(?:" +
      ae(" ") +
      any +
      ">|>))",
    "content",
    ae("url") + s + ae("=") + s,
    "i"
  );

  cr("<" + any + att + "href\\s*=" + any + ">", "href"); /* Linked elements */
  cr("<" + any + att + "src\\s*=" + any + ">", "src"); /* Embedded elements */

  cr(
    "<object" + any + att + "data\\s*=" + any + ">",
    "data"
  ); /* <object data= > */
  cr(
    "<applet" + any + att + "codebase\\s*=" + any + ">",
    "codebase"
  ); /* <applet codebase= > */

  /* <param name=movie value= >*/
  cr(
    "<param" +
      any +
      att +
      'name\\s*=\\s*(?:"' +
      ae("movie") +
      '"' +
      any +
      ">|'" +
      ae("movie") +
      "'" +
      any +
      ">|" +
      ae("movie") +
      "(?:" +
      ae(" ") +
      any +
      ">|>))",
    "value"
  );

  cr(
    /<style[^>]*>(?:[^"']*(?:"[^"]*"|'[^']*'))*?[^'"]*(?:<\/style|$)/gi,
    "url",
    "\\s*\\(\\s*",
    "",
    "\\s*\\)"
  ); /* <style> */
  cri(
    "<" + any + att + "style\\s*=" + any + ">",
    "style",
    ae("url") + s + ae("(") + s,
    0,
    s + ae(")"),
    ae(")")
  ); /*< style=" url(...) " > */
  return html;
}
