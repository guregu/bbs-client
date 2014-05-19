var bbsApp = angular.module('bbs', []);

bbsApp.run(function($rootScope) {
	$rootScope.currentServer = null;
	$rootScope.loginRedirect = null;

	$rootScope._bottom = function() {
		window.scrollTo(0,document.body.scrollHeight);
	}
});

bbsApp.config(function($routeProvider) {
	$routeProvider.
		when('/servers', {templateUrl: '/static/servers.html', controller: ServersCtrl}).
		when('/login', {templateUrl: '/static/login.html', controller: LoginCtrl}).
		when('/logout', {templateUrl: '/static/logout.html', controller: LogoutCtrl}).
		when('/home', {templateUrl: '/static/home.html', controller: HomeCtrl}).
		when('/threads', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		when('/threads/:query', {templateUrl: '/static/threads.html', controller: ThreadsCtrl}).
		when('/get/:id', {templateUrl: '/static/thread.html', controller: ThreadCtrl}).
		when('/get/:id/:filter', {templateUrl: '/static/thread.html', controller: ThreadCtrl}).
		when('/reply/:id', {templateUrl: '/static/reply.html', controller: ReplyCtrl}).
		when('/post', {templateUrl: '/static/post.html', controller: PostCtrl}).
		when('/register', {templateUrl: '/static/register.html', controller: RegisterCtrl}).
		otherwise({redirectTo: '/servers'});
});

bbsApp.factory('BBS', function($http, $rootScope, $location) {
	return function(url) {
		this.url = url;
		this.name = url;
		this.desc = "Pinging...";
		this.access = {};
		this.lists = [];
		this.options = [];
		this.formats = [];
		this.bookmarks = [];

		this.wsURL = null;
		this.realtime = false;
		this.socket = null;
		this.sendQueue = [];

		this.loggedIn = false;
		this.username = null;
		this.session = null;
		this.requiresLogin = false;

		var self = this;

		this.maybeConnect = function() {
			if (this.realtime) {
				this.connect();
			}
		}

		this.connect = function() {
			if (WebSocket == void(0)) {
				console.log("Couldn't websocket");
				this.realtime = false;
				return;
			}

			this.realtime = true;
			this.socket = new ReconnectingWebSocket(this.wsURL);
			this.socket.onopen = function() {
				console.log("Realtime: connected.");
				if (self.session) {
					self.relogin(self.session);
				}
				angular.forEach(self.sendQueue, function(msg) {
				    self.send(msg);
				});
				self.sendQueue = [];
			};
			this.socket.onclose = function() {
				console.log("Realtime: disconnected.");
			};
			this.socket.onerror = function (error) {

			};
			this.socket.onmessage = function(evt) {
				var data = angular.fromJson(evt.data);
				self.receive(data, true);
			};
		}

		this.send = function(cmd) {
			// websocket sends
			if (this.realtime) {
				if (this.socket && this.socket.readyState == 1) {
					console.dir(cmd);
					this.socket.send(angular.toJson(cmd));
				} else {
					this.sendQueue.push(cmd);
				}
				return;
			}

			// http sends
			if (this.session) {
				cmd.session = this.session;
			}
			$http.post(this.url, cmd).success(function(recv) {
				self.receive(recv);
			});
		}

		this.receive = function(data, apply) {
			console.log(data);
			if (data.cmd != "error") {
				$rootScope.$broadcast("#" + data.cmd, {
					server: this,
					data: data
				});
			} else {
				console.log("error: " + data.wrt);
				if (data.error == "session") {
					data.wrt = "session";
				}
				$rootScope.$broadcast("!" + data.wrt, {
					server: this,
					data: data
				});
			}
			if (apply) {
				$rootScope.$apply();
			}
		}

		this.init = function() {
			this.maybeConnect();
		}

		// update this bbs with data from "hello" cmd
		this.refresh = function(data) {
			this.name = data.name;
			this.desc = data.desc;
			this.access = data.access;
			this.lists = data.lists || [];
			this.options = data.options;
			this.formats = data.format || ["text"];
			this.defaultFormat = this.formats[0];
			this.wsURL = data.realtime;

			if (this.access.user && (this.access.user["get"] || this.access.user["list"])) {
				this.requiresLogin = true;
			}

			this.init();
		} 

		this.serialize = function() {
			return angular.toJson(this);
		}

		this.deserialize = function(b) {
			angular.extend(this, b);
			this.init();
		}

		this.supports = function(opt) {
			return this.options.indexOf(opt) != -1;
		}

		this.guestsCan = function(cmd) {
			return this.access.guest && this.access.guest.indexOf(cmd) != -1;
		}

		this.usersCan = function(cmd) {
			return this.access.user && this.access.user.indexOf(cmd) != -1;
		}

		this.can = function(cmd) {
			return (this.guestsCan(cmd) || this.usersCan(cmd));
		}

		this.hello = function() {
			this.send({
				cmd: "hello"
			});
		}

		this.login = function(username, password) {
			this.send({
				cmd: "login",
				username: username,
				password: password,
				version: 0
			});
		}

		this.relogin = function(session) {
			this.send({
				cmd: "login",
				session: session,
				version: 0
			});
		}

		this.register = function(u, p) {
			this.send({
				cmd: "register",
				username: u,
				password: p
				});
		}

		this.logout = function() {
			if (this.loggedIn) {
				this.send({
					cmd: "logout"
				});
			}	
			this.loggedIn = false;
			this.session = false;
			this.username = null;
		}

		this.list = function(type, query, token) {
			var cmd = {
				cmd: "list",
				type: type,
			};
			if (query) {
				cmd.query = query;
			}
			if (token) {
				cmd.token = token;
			}
			this.send(cmd);
		}

		this.get = function(id, token, filter, format) {
			var cmd = {
				cmd: "get",
				id: id,
				format: format || this.defaultFormat
			}
			if (token) {
				cmd.token = token;
			}
			if (filter) {
				cmd.filter = filter;
			}
			console.log(cmd);
			this.send(cmd);
		}

		this.getRange = function(id, range, filter, format) {
			var cmd = {
				cmd: "get",
				id: id,
				range: range,
				format: format || this.defaultFormat
			}
			if (filter) {
				cmd.filter = filter;
			}
			console.log(cmd);
			this.send(cmd);
		}

		this.reply = function(id, body, format) {
			var cmd = {
				cmd: "reply",
				to: id,
				body: body,
				format: format
			};
			this.send(cmd);
		}

		this.post = function(title, body, format, tags) {
			var cmd = {
				cmd: "post",
				title: title,
				body: body,
				format: format
			};
			if (tags) {
				cmd.tags = tags;
			}
			this.send(cmd);
		}

		this.home = function() {
			if (this.requiresLogin && !this.loggedIn) {
				return "/login";
			}
			if (this.lists.indexOf("board") != -1) {
				return "/boards";
			}
			return "/threads";
		}

		// our log-in is bad
		$rootScope.$on("!session", function(nm, evt) {
			if (evt.server == self) {
				self.loggedIn = false;
				self.session = null;
				$rootScope.loginRedirect = $location.path();
				$location.path("/login");
			}
		});

		$rootScope.$on("#list", function(nm, evt) {
			if (evt.server == self && evt.data.type == "bookmark") {
				console.log(evt.data);
				if (evt.data.bookmarks && evt.data.bookmarks.length > 0) {
					self.bookmarks = evt.data.bookmarks;
				}
				localStorage["current"] = self.serialize();
			}
		});

		$rootScope.$on("#welcome", function(nm, evt) {
			if (evt.server == self) {
				self.loggedIn = true;
				self.session = evt.data.session;
				self.username = evt.data.username;

				if (self == $rootScope.currentServer) {
					localStorage["current"] = self.serialize();
				}

				self.list("bookmark");
			}
		});
	}
});

bbsApp.factory('Servers', function($rootScope, BBS) {
//	var defaultServer = new BBS("/bbs", $http, $rootScope, $location);
	var servers = {};
//	servers[defaultServer.url] = defaultServer;

	var Servers = {
		add: function(url) {
			if (!servers[url]) {
				servers[url] = new BBS(url);
			}
		},
		list: function() {
			var list = [];
			angular.forEach(servers, function(v, k) {
				list.push(v);
			});
			return list;
		},
		get: function(url) {
			return servers[url];
		},
		refresh: function() {
			angular.forEach(servers, function(srv) {
				srv.hello();
			});
		}
	};

	$rootScope.$on("#hello", function(nm, evt) {
		servers[evt.server.url].refresh(evt.data);
	});

	return Servers;
});

bbsApp.filter('ago', function() {
	return function(input) {
		return moment(input).fromNow();
	}
})

bbsApp.directive('markdown', function() {
  marked.setOptions({
    gfm: true,
    tables: true,
    breaks: true,
    pedantic: false,
    sanitize: true,
    smartLists: true,
    smartypants: false
  });
 	return {
	    restrict: 'E',
	    require: '?ngModel',

        link: function(scope, element, attrs, model) {
        	var render = function() {
	        	var txt = "";
	        	if (attrs['ngModel']) {
	        		if (model.$modelValue) {
	 					txt = model.$modelValue;
	        		}
	        	} else {
	        		txt = element.text();
	        	}
	        	var htmlText = marked(txt);
	            element.html(htmlText);
	        }

        	if (attrs['ngModel']) {
                scope.$watch(attrs['ngModel'], render);
            }

            render();
        }
    }
});

bbsApp.run(function ($rootScope, Servers) {
	if (localStorage["current"]) {
		var data = angular.fromJson(localStorage["current"]);
		Servers.add(data.url);
		var srv = Servers.get(data.url);
		srv.deserialize(data);
		$rootScope.currentServer = srv;
	}
});

function ServersCtrl($rootScope, $scope, $location, $http, Servers) {
	$scope.servers = Servers.list();
	
	$scope.refresh = function() {
		Servers.refresh();
	}

	$scope.select = function(srv) {
		$rootScope.currentServer = srv;
		localStorage["current"] = srv.serialize();
		$location.path(srv.home());
	}

	$scope.logout = function() {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
	}

	$scope.$on("#hello", function(type, evt) {
		if (!evt.error) {
			$scope.servers = Servers.list();
		}
	});

	$http({method: 'GET', url: '/index.json', cache: true}).
	    success(function(data, status, headers, config) {
	      angular.forEach(data, function(server) {
	      	console.log('adding ' + server.path);
	      	Servers.add(server.path);
	      });
	      $scope.refresh();
	    }).
	    error(function(data, status, headers, config) {
	      $scope.error = data;
	    });

	$scope.refresh();
}

function LogoutCtrl($rootScope, $location) {
	if ($rootScope.currentServer) {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
	}
	$location.path("/servers");
}

function LoginCtrl($rootScope, $scope, $location) {
	$scope.error = null;
	$scope.username = "";
	$scope.password = "";
	$scope.loading = false;

	$scope.login = function() {
		if (!$scope.loading) {
			$rootScope.currentServer.login($scope.username, $scope.password);
			$scope.loading = true;
		}
	}

	$scope.$on("#welcome", function(nm, evt) {
		if ($rootScope.loginRedirect) {
			$location.path($rootScope.loginRedirect);
			$rootScope.loginRedirect = null;
		} else {
			$location.path(evt.server.home());
		}
	});

	$scope.$on("!login", function(nm, evt) {
		console.log(evt);
		$scope.error = evt.data.msg;
		$scope.loading = false;
	});
}

function HomeCtrl($rootScope, $location, $scope) {
	$scope.supportsRealtime = function() {
		return WebSocket != void(0);
	}

	$scope.realtime = function() {
		return $rootScope.currentServer.realtime;
	}

	$scope.toggleRealtime = function() {
		$rootScope.currentServer.realtime = !$rootScope.currentServer.realtime;
		$rootScope.currentServer.maybeConnect();
		localStorage["current"] = $rootScope.currentServer.serialize();
	}

	$scope.logout = function() {
		$rootScope.currentServer.logout();
	}

	$scope.disconnect = function() {
		$rootScope.currentServer.logout();
		$rootScope.currentServer = null;
		delete localStorage["current"];
		$location.path('/servers');
	}

	if (!$rootScope.currentServer) {
		$location.path('/servers');
	}
}

function ThreadsCtrl($rootScope, $scope, $location, $routeParams) {
	$scope.threads = [];
	$scope.error = null;
	$scope.query = $routeParams.query || null;
	$scope.next = null;

	$scope.loadMore = function() {
		if ($scope.next) {
			$rootScope.currentServer.list("thread", $scope.query, $scope.next);
		}
	}

	$scope.dangerous = function(tag) {
		var danger = ["NWS", "NLS", "Spoilers"];
		return danger.indexOf(tag) != -1;
	}

	$scope.view = function(thread) {
		$location.path("/get/" + thread.id);
	}

	$scope.$on("#list", function(nm, evt) {
		console.log(evt);
		if (evt.data.threads) {
			$scope.threads = $scope.threads.concat(evt.data.threads);
			remember(evt.data.threads);
			$scope.next = evt.data.next || null;
			//console.log(evt);
		}
	});

	function remember(threads) {
		angular.forEach(threads, function(thread) {
			sessionStorage["ct:" + thread.id] = angular.toJson({
				posts: thread.posts,
				unread: thread.unread_posts || 0
			});
		});
	}

	$scope.$on("!list", function(nm, evt) {
		console.log(evt);
		$scope.error = evt.data.error;
	});

	if (!$rootScope.currentServer) {
		$location.path("/servers");
	} else {
		$rootScope.currentServer.list("thread", $scope.query);
	}
}

function ThreadCtrl($rootScope, $scope, $routeParams, $location) {
	$scope.error = null;

	$scope.id = $routeParams.id;
	$scope.title = null;
	$scope.closed = false;
	$scope.filter = $routeParams.filter || null;
	$scope.tags = null;
	$scope.format = null;
	$scope.messages = [];
	$scope.next = null;
	$scope.range = { start: 0, end: 0 }
	$scope.total = null;

	var fetchAll = false;

	$scope.pushMessages = function(msgs) {
		// TODO: don't blindly concat, instead keep an index of msgids
		$scope.messages = $scope.messages.concat(msgs);
	}

	$scope.hasUnread = function() {
		var data = sessionStorage["ct:" + $scope.id];
		if (!data) {
			return false;
		}
		var ct = angular.fromJson(data);
		return (ct.unread > 0) && ($scope.range.end < (ct.posts + ct.unread));
	}

	$scope.loadUnread = function() {
		var data = sessionStorage["ct:" + $scope.id];
		if (!data) {
			return;
		}
		var ct = angular.fromJson(data);
		var start = (ct.posts - ct.unread) + 1
		var grab = 50;
		$rootScope.currentServer.getRange($scope.id, {start: start, end: start + grab - 1});
		ct.unread = Math.max(ct.unread - grab, 0);
		sessionStorage["ct:" + $scope.id] = angular.toJson(ct);
	}

	$scope.loadMore = function() {
		$rootScope.currentServer.get($scope.id, $scope.next, $scope.filter);
	}

	$scope.loadAll = function() {
		fetchAll = true;
		$scope.loadMore();
	}

	$scope.reply = function() {
		// TODO: make modal instead of redirect
		$location.path("/reply/" + $scope.id);
	}

	$scope.$on("#msg", function(nm, evt) {
		if (evt.data.id == $scope.id) {
			console.log(evt);
			var oldNext = $scope.next;
			$scope.title = evt.data.title;
			$scope.closed = evt.data.closed;
			$scope.filter = evt.data.filter;
			$scope.tags = evt.data.tags || null;
			$scope.format = evt.data.format;
			$scope.next = evt.data.next || null;
			$scope.range = evt.data.range;
			$scope.more = !!evt.data.more;
			$scope.total = evt.data.total;

			if (evt.data.messages) {
				$scope.pushMessages(evt.data.messages);
			}

			if (fetchAll) {
				if ($scope.more && $scope.next && (oldNext !== $scope.next)) {
					console.log('gettin more! ' + $scope.next);
					$scope.loadMore();
				} else {
					// we're out of nexts, untoggle
					fetchAll = false;
				}
			}
		}
	});

	$scope.$on("!get", function(nm, evt) {
		$scope.error = evt.data.error;

	});

	if (!$rootScope.currentServer) {
		$location.path("/servers");
	} else {
		$rootScope.currentServer.get($scope.id, $scope.next, $scope.filter);
	}
}

function ReplyCtrl($rootScope, $scope, $routeParams, $location) {
	$scope.id = $routeParams.id;
	$scope.error = null;
	$scope.body = "";
	$scope.format = "text";

	$scope.submit = function() {
		console.log("submitting...");
		$rootScope.currentServer.reply($scope.id, $scope.body, $scope.format);
	}

	$scope.$on("#ok", function(nm, evt) {
		if (evt.data.wrt == "reply") {
			$location.path("/get/" + $scope.id);
		}
	});

	$scope.$on("!reply", function(nm, evt) {
		$scope.error = evt.data.error;
	});
}

function PostCtrl($rootScope, $scope, $location) {
	$scope.error = null;
	$scope.title = null;
	$scope.body = "";
	$scope.format = "text";

	$scope.submit = function() {
		$rootScope.currentServer.post($scope.title, $scope.body, $scope.format);
	}

	$scope.$on("#ok", function(nm, evt) {
		console.log(evt);
		if (evt.data.wrt == "post") {
			$location.path("/get/" + evt.data.result);
		}
	});

	$scope.$on("!post", function(nm, evt) {
		console.log(evt);
		$scope.error = evt.data.error;
	});
}

function RegisterCtrl($rootScope, $scope, $location) {
        $scope.error = null;
        $scope.username = "";
        $scope.password = "";

        $scope.submit = function() {
                $rootScope.currentServer.register($scope.username, $scope.password);
        }

        $scope.$on("#ok", function(nm, evt) {
		console.log(evt);
		if (evt.data.wrt == "register") {
	        	$rootScope.currentServer.login($scope.username, $scope.password);
				$location.path($rootScope.currentServer.home())
          	}
        });

        $scope.$on("!register", function(nm, evt) {
                console.log(evt);
                $scope.error = evt.data.msg;
        });
}	
