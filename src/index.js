const express = require("express");
const bodyParser = require("body-parser");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "JAFKLJSADF;LKasdfas;kdfj;213kja;sdf;";

const prisma = new PrismaClient();
const app = express();

app.use(bodyParser.json());
app.use(express.static("public"));

app.get("/api", (req, res) => {
    res.json({ running: true });
});

const errorMessage = (msg) => {
    return {
        status: "error",
        error: msg,
    };
};

const authMiddleware = async (req, res, next) => {
    const authHeader = req.header("Authorization");
    const token = authHeader ? authHeader.split(" ")[1] : undefined;

    if (!authHeader || !token) {
        return res.status(401).json(errorMessage("Not authorized"));
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
    } catch (e) {
        return res.status(401).json(errorMessage("Invalid token"));
    }

    next();
};

app.post("/api/register", async (req, res) => {
    const { email, password } = req.body;

    if (!email || typeof email != "string") {
        return res.json(errorMessage("Invalid email"));
    }

    if (!password || typeof password != "string") {
        return res.json(errorMessage("Invalid password"));
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await prisma.user.create({
            data: {
                email: email,
                password: hashedPassword,
            },
        });
        res.status(201).json({ status: "user created" });
    } catch (e) {
        res.status(500).send(e);
    }
});

app.post("/api/authenticate", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(500).json(errorMessage("Invalid email or password"));
    }

    try {
        const user = await prisma.user.findUnique({
            where: {
                email: email,
            },
        });

        if (!user) {
            return res.json(errorMessage("Invalid email or password"));
        }

        if (await bcrypt.compare(password, user.password)) {
            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                },
                JWT_SECRET
            );
            return res.json({ status: "ok", data: token });
        }
    } catch (e) {
        return res.status(500).json(errorMessage("Some error occured"));
    }

    return res.json(errorMessage("Invalid email or password"));
});

app.post("/api/follow/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    let user;
    try {
        user = await prisma.user.update({
            where: {
                id: req.user.id,
            },
            data: {
                following: {
                    connect: {
                        id: id,
                    },
                },
            },
            select: {
                following: {
                    select: {
                        id: true,
                    },
                },
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("User to follow does not exist"));
    }

    res.json({ status: "followd", data: user });
});

app.post("/api/unfollow/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    let user;
    try {
        user = await prisma.user.update({
            where: {
                id: req.user.id,
            },
            data: {
                following: {
                    disconnect: {
                        id: id,
                    },
                },
            },
            select: {
                following: {
                    select: {
                        id: true,
                    },
                },
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("User to follow does not exist"));
    }

    res.json({ status: "unfollowed", data: user });
});

app.get("/api/user", authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.id,
            },
            select: {
                id: true,
                email: true,
                following: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
                followedBy: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        following: true,
                        followedBy: true,
                    },
                },
            },
        });

        if (!user) {
            return res.status(500).json(errorMessage("User not found"));
        }

        return res.send(user);
    } catch (e) {
        return res.status(500).json(errorMessage("Some error occured"));
    }
    return res.status(500).json(errorMessage("Some error occured"));
});

app.get("/api/users", async (req, res) => {
    const users = await prisma.user.findMany();
    res.send(users);
});

app.post("/api/posts", authMiddleware, async (req, res) => {
    const { title, description } = req.body;

    if (!title || !description) {
        return res.status(500).json(errorMessage("Invalid post body"));
    }

    let post;
    try {
        post = await prisma.post.create({
            data: {
                authorId: req.user.id,
                title: title,
                description: description,
            },
            select: {
                postId: true,
                title: true,
                description: true,
                createdAt: true,
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("Invalid post body"));
    }

    res.status(201).send(post);
});

app.delete("/api/posts/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    let post;
    try {
        post = await prisma.post.delete({
            where: {
                postId: id,
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("Some error occured"));
    }

    res.json({ status: "deleted", post: post });
});

app.post("/api/like/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    try {
        const res = await prisma.like.create({
            data: {
                postId: id,
                userId: req.user.id,
            },
        });
    } catch (err) {
        return res.status(500).json(errorMessage("some error occured"));
    }

    res.json({ status: "liked" });
});

app.post("/api/unlike/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    try {
        const res = await prisma.like.delete({
            where: {
                postId_userId: {
                    postId: id,
                    userId: req.user.id,
                },
            },
        });
    } catch (err) {
        return res.status(500).json(errorMessage("some error occured"));
    }

    res.json({ status: "unliked" });
});

app.post("/api/comment/:id", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    const { comment } = req.body;

    if (!comment) {
        return res.status(500).json(errorMessage("Invalid comment body"));
    }

    let data;
    try {
        data = await prisma.comment.create({
            data: {
                authorId: req.user.id,
                postId: id,
                comment: comment,
            },
            select: {
                commentId: true,
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("some error occured"));
    }

    res.status(201).json(data);
});

app.get("/api/posts/:id", async (req, res) => {
    const id = parseInt(req.params.id);

    if (!id || isNaN(id)) {
        return res.status(500).json(errorMessage("id invalid"));
    }

    let posts;
    try {
        posts = await prisma.post.findUnique({
            where: {
                postId: id,
            },
            include: {
                _count: {
                    select: {
                        likes: true,
                        comments: true,
                    },
                },
                likes: true,
                comments: true,
            },
        });
    } catch (e) {
        return res.status(500).json(errorMessage("some error occured"));
    }

    res.send(posts);
});

app.get("/api/all_posts", authMiddleware, async (req, res) => {
    try {
        const posts = await prisma.user.findUnique({
            where: {
                id: req.user.id,
            },
            select: {
                posts: {
                    select: {
                        postId: true,
                        title: true,
                        description: true,
                        createdAt: true,
                        comments: true,
                        _count: {
                            select: {
                                likes: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });

        return res.send(posts);
    } catch (e) {
        return res.status(500).json(errorMessage("Some error occured"));
    }
    return res.status(500).json(errorMessage("Some error occured"));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server ready at: http://localhost:${PORT}`));
