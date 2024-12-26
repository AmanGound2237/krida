import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const Home = () => {
    const [posts, setPosts] = useState([]); // Initialize posts state
    const [loading, setLoading] = useState(true); // Track loading state
    const navigate = useNavigate();

    // Fetch projects from backend (adjust URL as needed)
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const token = localStorage.getItem("token"); // Assume the token is saved in localStorage
                if (!token) {
                    toast.error("No token found. Please log in.");
                    navigate("/login");
                    return;
                }

                const response = await axios.get("/api/projects", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (response.data) {
                    setPosts(response.data); // Set the posts (projects)
                }
            } catch (error) {
                console.error("Error fetching projects:", error);
                toast.error("Failed to fetch projects. Please try again later.");
            } finally {
                setLoading(false); // Stop loading after fetching
            }
        };

        fetchProjects();
    }, [navigate]);

    const handleCreateProject = () => {
        navigate("/create-project"); // Redirect to create project page
    };

    // Render the loading spinner or the projects
    if (loading) {
        return <div>Loading projects...</div>;
    }

    return (
        <div>
            <h1>Welcome to the Home Page</h1>

            <button onClick={handleCreateProject}>Create New Project</button>

            {posts.length === 0 ? (
                <div>No projects found. Start by creating one!</div>
            ) : (
                <div>
                    <h2>Your Projects</h2>
                    <ul>
                        {posts.map((post) => (
                            <li key={post._id}>
                                <h3>{post.name}</h3>
                                <p>{post.createdAt}</p>
                                {/* Add more fields here as needed */}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default Home;
