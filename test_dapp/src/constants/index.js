const notificationConfig = {
    message: "",
    type: "",
    insert: "top",
    container: "top-center",
    animationIn: ["animate__animated", "animate__fadeIn"],
    animationOut: ["animate__animated", "animate__fadeOut"],
    dismiss: {
        duration: 5000,
        onScreen: true
    }
};

const navbarList = [
    {
        title: "Home",
        to: "/",
        icon: "fas"
    },
    {
        title: "Vesting",
        to: "/vesting",
        icon: "far"
    },
    {
        title: "Main Pool",
        to: "/main-pool",
        icon: "far"
    },
    {
        title: "Merchant Pool",
        to: "/merchant-pool",
        icon: "far"
    },
    {
        title: "Admin",
        to: "/admin",
        icon: "far"
    },

]

export {
    notificationConfig,
    navbarList
}